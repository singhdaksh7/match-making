import { Router, type Request } from 'express'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from './db.js'
import { allow, requireAuth } from './auth.js'
import { HttpError, asyncRoute, pagination } from './http.js'
import { moveInventory } from './inventory.js'
import crypto from 'node:crypto'
import multer from 'multer'
import { config } from './config.js'
import {
  assertAllowedValuesNotInUse, assertAttributeValueUnused, assertUniqueVariantCombination,
  assertVariantAttributeValues, isUniqueConstraint, loadImageTarget, productInclude, resolveProductAttributeSelection,
  serializeAttributeImage, serializeProduct,
} from './productAttributes.js'
import { assertImageFile, attributeImageKey, allowedMime, deleteImageFiles, generalMediaKey, isOwnedKey, publicUrl, saveImage } from './storage/index.js'

const status=z.enum(['ACTIVE','INACTIVE','DRAFT','ARCHIVED','DISABLED','EXPIRED'])
const list=(model:any, searchField?:string)=>asyncRoute(async(req,res)=>{const {page,limit,skip}=pagination(req), q=String(req.query.q??'');const where:any={businessId:req.principal!.businessId,...(q&&searchField?{[searchField]:{contains:q,mode:'insensitive'}}:{})};const [items,total]=await prisma.$transaction([model.findMany({where,skip,take:limit,orderBy:{createdAt:'desc'}}),model.count({where})]);res.json({data:items,meta:{page,limit,total}})})
export const adminRouter=Router(); adminRouter.use(requireAuth)
const categoryInput=z.object({name:z.string().min(2),slug:z.string().regex(/^[a-z0-9-]+$/),status:status.optional(),attributeIds:z.array(z.string()).optional()})
adminRouter.get('/categories',asyncRoute(async(req,res)=>{const {page,limit,skip}=pagination(req),q=String(req.query.q??'');const where:any={businessId:req.principal!.businessId,...(q?{name:{contains:q,mode:'insensitive'}}:{})};const [data,total]=await prisma.$transaction([prisma.category.findMany({where,skip,take:limit,include:{categoryAttributes:true},orderBy:{createdAt:'desc'}}),prisma.category.count({where})]);res.json({data,meta:{page,limit,total}})}))
adminRouter.post('/categories',allow('OWNER','ADMIN'),asyncRoute(async(req,res)=>{const d=categoryInput.parse(req.body);const attributeIds=d.attributeIds??[];if(attributeIds.length){const attrs=await prisma.attribute.findMany({where:{id:{in:attributeIds},businessId:req.principal!.businessId}});if(attrs.length!==attributeIds.length)throw new HttpError(400,'One or more attributes are invalid','VALIDATION_ERROR')}res.status(201).json({data:await prisma.category.create({data:{name:d.name,slug:d.slug,status:d.status,businessId:req.principal!.businessId,categoryAttributes:{create:attributeIds.map(attributeId=>({attributeId}))}},include:{categoryAttributes:true}})})}))
adminRouter.patch('/categories/:id',allow('OWNER','ADMIN'),asyncRoute(async(req,res)=>{const d=categoryInput.partial().parse(req.body);const existing=await prisma.category.findFirst({where:{id:String(req.params.id),businessId:req.principal!.businessId}});if(!existing)throw new HttpError(404,'Category not found','NOT_FOUND');if(d.attributeIds){const attrs=await prisma.attribute.findMany({where:{id:{in:d.attributeIds},businessId:req.principal!.businessId}});if(attrs.length!==d.attributeIds.length)throw new HttpError(400,'One or more attributes are invalid','VALIDATION_ERROR')}const category=await prisma.$transaction(async(tx)=>{if(d.attributeIds){await tx.categoryAttribute.deleteMany({where:{categoryId:existing.id}});await tx.categoryAttribute.createMany({data:d.attributeIds.map(attributeId=>({categoryId:existing.id,attributeId}))})}const {attributeIds:_ignored,...rest}=d;return tx.category.update({where:{id:existing.id},data:rest,include:{categoryAttributes:true}})});res.json({data:category})}))
adminRouter.delete('/categories/:id',allow('OWNER','ADMIN'),asyncRoute(async(req,res)=>{const existing=await prisma.category.findFirst({where:{id:String(req.params.id),businessId:req.principal!.businessId},include:{_count:{select:{products:true}}}});if(!existing)throw new HttpError(404,'Category not found','NOT_FOUND');if(existing._count.products>0)throw new HttpError(409,'Category cannot be deleted while products still use it','CONFLICT');await prisma.category.delete({where:{id:existing.id}});res.status(204).end()}))
adminRouter.get('/attributes',asyncRoute(async(req,res)=>res.json({data:await prisma.attribute.findMany({where:{businessId:req.principal!.businessId},include:{values:true},orderBy:{createdAt:'desc'}})})))
adminRouter.post('/attributes',allow('OWNER','ADMIN'),asyncRoute(async(req,res)=>{const d=z.object({name:z.string().min(1),kind:z.enum(['COLOR','TEXT','SIZE','SELECT']),supportsImages:z.boolean().optional(),values:z.array(z.object({value:z.string().min(1),hex:z.string().optional()})).default([])}).parse(req.body);res.status(201).json({data:await prisma.attribute.create({data:{businessId:req.principal!.businessId,name:d.name,kind:d.kind,supportsImages:d.supportsImages??false,values:{create:d.values}},include:{values:true}})})}))
adminRouter.patch('/attributes/:id',allow('OWNER','ADMIN'),asyncRoute(async(req,res)=>{const d=z.object({name:z.string().min(1).optional(),kind:z.enum(['COLOR','TEXT','SIZE','SELECT']).optional(),supportsImages:z.boolean().optional()}).parse(req.body);if(d.supportsImages===false){const owned=await prisma.attribute.findFirst({where:{id:String(req.params.id),businessId:req.principal!.businessId}});if(!owned)throw new HttpError(404,'Attribute not found','NOT_FOUND');const imageCount=await prisma.productAttributeValueImage.count({where:{productAttributeValue:{attributeValue:{attributeId:owned.id}}}});if(imageCount>0)throw new HttpError(409,`Images cannot be disabled for ${owned.name} because ${imageCount} attribute-value image${imageCount===1?'':'s'} still exist. Delete them first.`,'CONFLICT')}const updated=await prisma.attribute.updateMany({where:{id:String(req.params.id),businessId:req.principal!.businessId},data:d});if(!updated.count)throw new HttpError(404,'Attribute not found','NOT_FOUND');res.json({data:await prisma.attribute.findFirst({where:{id:String(req.params.id),businessId:req.principal!.businessId},include:{values:true}})})}))
adminRouter.post('/attributes/:id/values',allow('OWNER','ADMIN'),asyncRoute(async(req,res)=>{const d=z.object({value:z.string().min(1),hex:z.string().optional()}).parse(req.body);const attribute=await prisma.attribute.findFirst({where:{id:String(req.params.id),businessId:req.principal!.businessId}});if(!attribute)throw new HttpError(404,'Attribute not found','NOT_FOUND');try{res.status(201).json({data:await prisma.attributeValue.create({data:{attributeId:attribute.id,...d}})})}catch(error){if(isUniqueConstraint(error))throw new HttpError(409,'That value already exists on this attribute','CONFLICT');throw error}}))
adminRouter.delete('/attributes/:id/values/:valueId',allow('OWNER','ADMIN'),asyncRoute(async(req,res)=>{const attribute=await prisma.attribute.findFirst({where:{id:String(req.params.id),businessId:req.principal!.businessId}});if(!attribute)throw new HttpError(404,'Attribute not found','NOT_FOUND');await assertAttributeValueUnused(req.principal!.businessId,String(req.params.valueId));await prisma.attributeValue.delete({where:{id:String(req.params.valueId)}});res.status(204).end()}))
adminRouter.get('/customers',list(prisma.customer,'businessName')); adminRouter.post('/customers',allow('OWNER','ADMIN','STAFF','SALES'),asyncRoute(async(req,res)=>{const d=z.object({businessName:z.string(),contactPerson:z.string(),phone:z.string(),whatsapp:z.string().optional(),email:z.string().email().optional(),city:z.string().optional(),state:z.string().optional(),type:z.enum(['WHOLESALER','RETAILER','DISTRIBUTOR','RESELLER']),gstNumber:z.string().optional(),notes:z.string().optional(),status:status.optional()}).parse(req.body);res.status(201).json({data:await prisma.customer.create({data:{...d,businessId:req.principal!.businessId}})})}))
adminRouter.get('/customers/:id',asyncRoute(async(req,res)=>{const x=await prisma.customer.findFirst({where:{id:String(req.params.id),businessId:req.principal!.businessId}});if(!x)throw new HttpError(404,'Customer not found','NOT_FOUND');res.json({data:x})})); adminRouter.patch('/customers/:id',allow('OWNER','ADMIN','STAFF','SALES'),asyncRoute(async(req,res)=>{const d=z.object({businessName:z.string().optional(),contactPerson:z.string().optional(),phone:z.string().optional(),status:status.optional(),notes:z.string().optional()}).parse(req.body);const x=await prisma.customer.updateMany({where:{id:String(req.params.id),businessId:req.principal!.businessId},data:d});if(!x.count)throw new HttpError(404,'Customer not found','NOT_FOUND');res.status(204).end()}))
const variantInput=z.object({sku:z.string().min(1),price:z.number().nonnegative(),stock:z.number().int().nonnegative().optional(),attributeValueIds:z.array(z.string()).optional(),attributeAssignments:z.array(z.object({attributeId:z.string(),attributeValueId:z.string()})).optional()})
const productInput=z.object({categoryId:z.string(),code:z.string().min(1),name:z.string().min(1),description:z.string().default(''),basePrice:z.number().nonnegative(),moq:z.number().int().positive().default(1),status:status.optional(),attributeIds:z.array(z.string()).optional(),allowedAttributeValueIds:z.array(z.string()).optional(),media:z.array(z.object({objectKey:z.string(),url:z.string().optional(),mimeType:z.string(),sizeBytes:z.number().int().nonnegative().optional(),primary:z.boolean().optional(),sortOrder:z.number().int().optional()})).default([]),variants:z.array(variantInput).optional()})
adminRouter.get('/products',asyncRoute(async(req,res)=>{const {page,limit,skip}=pagination(req),q=String(req.query.q??'');const where={businessId:req.principal!.businessId,...(q?{OR:[{name:{contains:q,mode:'insensitive' as const}},{code:{contains:q,mode:'insensitive' as const}}]}:{})};const [data,total]=await prisma.$transaction([prisma.product.findMany({where,skip,take:limit,include:productInclude,orderBy:{createdAt:'desc'}}),prisma.product.count({where})]);res.json({data:data.map(serializeProduct),meta:{page,limit,total}})}))
adminRouter.post('/products',allow('OWNER','ADMIN','STAFF'),asyncRoute(async(req,res)=>{
  const d=productInput.parse(req.body)
  const allowedAttributeValueIds=d.allowedAttributeValueIds??[]
  const attributeIds=d.attributeIds??[]
  const variants=d.variants??[]
  for(const m of d.media) if(!isOwnedKey(req.principal!.businessId,m.objectKey)) throw new HttpError(400,'Invalid media object key','VALIDATION_ERROR')
  const selection=await resolveProductAttributeSelection(req.principal!.businessId,d.categoryId,attributeIds,allowedAttributeValueIds)
  for(const variant of variants){
    await assertVariantAttributeValues({businessId:req.principal!.businessId,categoryId:d.categoryId,allowedAttributeValueIds,attributeValueIds:variant.attributeValueIds??[],assignments:variant.attributeAssignments})
  }
  const comboKeys=new Set<string>()
  for(const variant of variants){
    const key=[...variant.attributeValueIds??[]].sort().join('|')
    if(comboKeys.has(key)) throw new HttpError(409,'A variant with this combination already exists','CONFLICT')
    comboKeys.add(key)
  }
  try{
    const product=await prisma.product.create({data:{
      businessId:req.principal!.businessId,categoryId:d.categoryId,code:d.code,name:d.name,description:d.description,basePrice:d.basePrice,moq:d.moq,status:d.status,
      media:{create:d.media.map(m=>({objectKey:m.objectKey,url:publicUrl(m.objectKey),mimeType:m.mimeType,sizeBytes:m.sizeBytes,primary:m.primary,sortOrder:m.sortOrder}))},
      attributes:{create:selection.attributeIds.map(attributeId=>({attributeId}))},
      allowedValues:{create:allowedAttributeValueIds.map(attributeValueId=>({attributeValueId}))},
      variants:{create:variants.map(v=>({sku:v.sku,price:v.price,stock:v.stock??0,attributeValues:{create:(v.attributeValueIds??[]).map(attributeValueId=>({attributeValueId}))}}))},
    },include:productInclude})
    res.status(201).json({data:serializeProduct(product)})
  }catch(error){
    if(isUniqueConstraint(error)) throw new HttpError(409,'A product or SKU with that code already exists','CONFLICT')
    throw error
  }
}))
adminRouter.get('/products/:id',asyncRoute(async(req,res)=>{const x=await prisma.product.findFirst({where:{id:String(req.params.id),businessId:req.principal!.businessId},include:productInclude});if(!x)throw new HttpError(404,'Product not found','NOT_FOUND');res.json({data:serializeProduct(x)})}))
adminRouter.patch('/products/:id',allow('OWNER','ADMIN','STAFF'),asyncRoute(async(req,res)=>{
  const d=productInput.partial().omit({variants:true,media:true}).parse(req.body)
  const product=await prisma.product.findFirst({where:{id:String(req.params.id),businessId:req.principal!.businessId}})
  if(!product) throw new HttpError(404,'Product not found','NOT_FOUND')
  const categoryId=d.categoryId??product.categoryId
  if(d.allowedAttributeValueIds||d.attributeIds||d.categoryId){
    const nextAllowed=d.allowedAttributeValueIds??(await prisma.productAttributeValue.findMany({where:{productId:product.id}})).map(row=>row.attributeValueId)
    const nextAttributeIds=d.attributeIds??(await prisma.productAttribute.findMany({where:{productId:product.id}})).map(row=>row.attributeId)
    const selection=await resolveProductAttributeSelection(req.principal!.businessId,categoryId,nextAttributeIds,nextAllowed)
    await assertAllowedValuesNotInUse(product.id,nextAllowed)
    const removedKeys=await prisma.$transaction(async(tx)=>{
      // Diff (never delete+recreate): re-creating rows would cascade-delete the images of values that stay enabled.
      const current=(await tx.productAttributeValue.findMany({where:{productId:product.id}})).map(row=>row.attributeValueId)
      const next=new Set(nextAllowed), existing=new Set(current)
      const removed=current.filter(id=>!next.has(id)), added=[...next].filter(id=>!existing.has(id))
      const orphaned=removed.length?(await tx.productAttributeValueImage.findMany({where:{productId:product.id,attributeValueId:{in:removed}},select:{objectKey:true}})).map(row=>row.objectKey):[]
      await tx.productAttribute.deleteMany({where:{productId:product.id}})
      if(selection.attributeIds.length) await tx.productAttribute.createMany({data:selection.attributeIds.map(attributeId=>({productId:product.id,attributeId}))})
      if(removed.length) await tx.productAttributeValue.deleteMany({where:{productId:product.id,attributeValueId:{in:removed}}}) // images go by composite-FK cascade
      if(added.length) await tx.productAttributeValue.createMany({data:added.map(attributeValueId=>({productId:product.id,attributeValueId}))})
      await tx.product.update({where:{id:product.id},data:{...(d.name!==undefined?{name:d.name}:{}),...(d.description!==undefined?{description:d.description}:{}),...(d.basePrice!==undefined?{basePrice:d.basePrice}:{}),...(d.moq!==undefined?{moq:d.moq}:{}),...(d.status!==undefined?{status:d.status}:{}),...(d.categoryId!==undefined?{categoryId:d.categoryId}:{}),...(d.code!==undefined?{code:d.code}:{})}})
      return orphaned
    })
    await deleteImageFiles(removedKeys) // after commit, best-effort
  }else{
    const {attributeIds:_a,allowedAttributeValueIds:_b,...rest}=d
    const x=await prisma.product.updateMany({where:{id:product.id,businessId:req.principal!.businessId},data:rest})
    if(!x.count) throw new HttpError(404,'Product not found','NOT_FOUND')
  }
  await prisma.auditLog.create({data:{businessId:req.principal!.businessId,actorId:req.principal!.id,action:'PRODUCT_UPDATED',entity:'Product',entityId:product.id}})
  res.status(204).end()
}))
adminRouter.post('/products/:id/variants',allow('OWNER','ADMIN','STAFF'),asyncRoute(async(req,res)=>{
  const d=variantInput.parse(req.body)
  const product=await prisma.product.findFirst({where:{id:String(req.params.id),businessId:req.principal!.businessId},include:{allowedValues:true}})
  if(!product) throw new HttpError(404,'Product not found','NOT_FOUND')
  await assertVariantAttributeValues({businessId:req.principal!.businessId,categoryId:product.categoryId,allowedAttributeValueIds:product.allowedValues.map(row=>row.attributeValueId),attributeValueIds:d.attributeValueIds??[],assignments:d.attributeAssignments})
  await assertUniqueVariantCombination(product.id,d.attributeValueIds??[])
  try{
    const variant=await prisma.productVariant.create({data:{productId:product.id,sku:d.sku,price:d.price,stock:d.stock??0,attributeValues:{create:(d.attributeValueIds??[]).map(attributeValueId=>({attributeValueId}))}},include:{attributeValues:{include:{attributeValue:{include:{attribute:true}}}}}})
    res.status(201).json({data:variant})
  }catch(error){
    if(isUniqueConstraint(error)) throw new HttpError(409,'A variant with that SKU already exists','CONFLICT')
    throw error
  }
}))
adminRouter.patch('/products/:id/variants/:variantId',allow('OWNER','ADMIN','STAFF'),asyncRoute(async(req,res)=>{
  const d=variantInput.partial().parse(req.body)
  const product=await prisma.product.findFirst({where:{id:String(req.params.id),businessId:req.principal!.businessId},include:{allowedValues:true}})
  if(!product) throw new HttpError(404,'Product not found','NOT_FOUND')
  const variant=await prisma.productVariant.findFirst({where:{id:String(req.params.variantId),productId:product.id},include:{attributeValues:true}})
  if(!variant) throw new HttpError(404,'Variant not found','NOT_FOUND')
  const nextValueIds=d.attributeValueIds??variant.attributeValues.map(row=>row.attributeValueId)
  if(d.attributeValueIds||d.attributeAssignments){
    await assertVariantAttributeValues({businessId:req.principal!.businessId,categoryId:product.categoryId,allowedAttributeValueIds:product.allowedValues.map(row=>row.attributeValueId),attributeValueIds:nextValueIds,assignments:d.attributeAssignments})
    await assertUniqueVariantCombination(product.id,nextValueIds,variant.id)
  }
  const updated=await prisma.$transaction(async(tx)=>{
    if(d.attributeValueIds){
      await tx.variantAttributeValue.deleteMany({where:{variantId:variant.id}})
      await tx.variantAttributeValue.createMany({data:d.attributeValueIds.map(attributeValueId=>({variantId:variant.id,attributeValueId}))})
    }
    return tx.productVariant.update({where:{id:variant.id},data:{...(d.sku!==undefined?{sku:d.sku}:{}),...(d.price!==undefined?{price:d.price}:{}),...(d.stock!==undefined?{stock:d.stock}:{})},include:{attributeValues:{include:{attributeValue:{include:{attribute:true}}}}}})
  })
  res.json({data:updated})
}))
adminRouter.post('/inventory/movements',allow('OWNER','ADMIN','STAFF','INVENTORY_MANAGER'),asyncRoute(async(req,res)=>{const d=z.object({variantId:z.string(),type:z.enum(['PRODUCTION','SALE','ADJUSTMENT','DAMAGE','RETURN','RESERVATION','RELEASE']),quantity:z.number().int().positive(),reason:z.string().min(2),reference:z.string().optional()}).parse(req.body);res.status(201).json({data:await moveInventory(req.principal!,d)})}))
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:config.uploadMaxBytes,files:1},fileFilter:(_req,file,cb)=>cb(null,allowedMime.has(file.mimetype))})
adminRouter.post('/media',allow('OWNER','ADMIN','STAFF'),upload.single('file'),asyncRoute(async(req,res)=>{
  if(!req.file)throw new HttpError(400,'A supported image file is required','VALIDATION_ERROR')
  assertImageFile(req.file)
  // The product does not exist yet at staging time, so the key lives under products/_staged.
  const objectKey=await saveImage({key:generalMediaKey(req.principal!.businessId,undefined,req.file.mimetype),body:req.file.buffer,contentType:req.file.mimetype})
  res.status(201).json({data:{objectKey,url:publicUrl(objectKey),mimeType:req.file.mimetype,sizeBytes:req.file.size}})
}))

// ---- attribute-value specific images ----
const imageBase='/products/:id/attribute-values/:attributeValueId/images'
const imageParams=(req:Request)=>({productId:String(req.params.id),attributeValueId:String(req.params.attributeValueId)})
const imageUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:config.uploadMaxBytes,files:10},fileFilter:(_req,file,cb)=>allowedMime.has(file.mimetype)?cb(null,true):cb(new HttpError(400,'Only JPEG, PNG, WebP or GIF images are accepted','VALIDATION_ERROR'))}).array('files',10)
const orderedImages=(productId:string,attributeValueId:string,tx:Prisma.TransactionClient|typeof prisma=prisma)=>tx.productAttributeValueImage.findMany({where:{productId,attributeValueId},orderBy:[{sortOrder:'asc'},{createdAt:'asc'}]})
// Authorisation + target validation run BEFORE the multipart body is parsed/buffered.
const authoriseImageTarget=asyncRoute(async(req,_res,next)=>{const {productId,attributeValueId}=imageParams(req);await loadImageTarget(req.principal!.businessId,productId,attributeValueId);next()})
adminRouter.post(imageBase,allow('OWNER','ADMIN','STAFF'),authoriseImageTarget,imageUpload,asyncRoute(async(req,res)=>{
  const {productId,attributeValueId}=imageParams(req), businessId=req.principal!.businessId
  const files=(req.files as Express.Multer.File[]|undefined)??[]
  if(!files.length) throw new HttpError(400,'At least one image file is required in the "files" field','VALIDATION_ERROR')
  for(const file of files) assertImageFile(file) // validate every file before writing anything
  const written:string[]=[]
  try{
    for(const file of files) written.push(await saveImage({key:attributeImageKey(businessId,productId,attributeValueId,file.mimetype),body:file.buffer,contentType:file.mimetype}))
  }catch(error){ await deleteImageFiles(written); throw error }
  try{
    const created=await prisma.$transaction(async(tx)=>{
      const last=await tx.productAttributeValueImage.aggregate({where:{productId,attributeValueId},_max:{sortOrder:true}})
      let next=(last._max.sortOrder??-1)+1
      const rows=[]
      for(const [i,file] of files.entries()) rows.push(await tx.productAttributeValueImage.create({data:{productId,attributeValueId,objectKey:written[i],mimeType:file.mimetype,sizeBytes:file.size,sortOrder:next++}}))
      return rows
    })
    res.status(201).json({data:created.map(serializeAttributeImage)})
  }catch(error){
    await deleteImageFiles(written) // compensate: no DB row => no object
    if(typeof error==='object'&&error&&(error as {code?:string}).code==='P2003') throw new HttpError(409,'This value is no longer enabled for the product','CONFLICT')
    throw error
  }
}))
adminRouter.delete(`${imageBase}/:imageId`,allow('OWNER','ADMIN','STAFF'),authoriseImageTarget,asyncRoute(async(req,res)=>{
  const {productId,attributeValueId}=imageParams(req)
  const image=await prisma.productAttributeValueImage.findFirst({where:{id:String(req.params.imageId),productId,attributeValueId}})
  if(!image) throw new HttpError(404,'Image not found','NOT_FOUND')
  const removed=await prisma.productAttributeValueImage.deleteMany({where:{id:image.id}}) // DB first; the key comes only from the row
  if(removed.count) await deleteImageFiles([image.objectKey])
  res.status(204).end()
}))
adminRouter.put(`${imageBase}/order`,allow('OWNER','ADMIN','STAFF'),authoriseImageTarget,asyncRoute(async(req,res)=>{
  const {productId,attributeValueId}=imageParams(req)
  const {imageIds}=z.object({imageIds:z.array(z.string()).max(500)}).parse(req.body)
  const data=await prisma.$transaction(async(tx)=>{
    const current=await orderedImages(productId,attributeValueId,tx)
    const wanted=new Set(imageIds)
    if(wanted.size!==imageIds.length||imageIds.length!==current.length||!current.every(row=>wanted.has(row.id))) throw new HttpError(400,'imageIds must contain exactly the current image ids of this value, once each','VALIDATION_ERROR')
    for(const [index,id] of imageIds.entries()) await tx.productAttributeValueImage.update({where:{id},data:{sortOrder:index}})
    return orderedImages(productId,attributeValueId,tx)
  })
  res.json({data:data.map(serializeAttributeImage)})
}))
adminRouter.patch(`${imageBase}/:imageId`,allow('OWNER','ADMIN','STAFF'),authoriseImageTarget,asyncRoute(async(req,res)=>{
  const {productId,attributeValueId}=imageParams(req)
  const d=z.object({altText:z.string().max(300).nullable().optional()}).parse(req.body)
  const image=await prisma.productAttributeValueImage.findFirst({where:{id:String(req.params.imageId),productId,attributeValueId}})
  if(!image) throw new HttpError(404,'Image not found','NOT_FOUND')
  const updated=await prisma.productAttributeValueImage.update({where:{id:image.id},data:{...(d.altText!==undefined?{altText:d.altText}:{})}})
  res.json({data:serializeAttributeImage(updated)})
}))
adminRouter.get('/collections',asyncRoute(async(req,res)=>{const {page,limit,skip}=pagination(req),q=String(req.query.q??'');const where:any={businessId:req.principal!.businessId,...(q?{name:{contains:q,mode:'insensitive'}}:{})};const [data,total]=await prisma.$transaction([prisma.collection.findMany({where,skip,take:limit,include:{products:true},orderBy:{createdAt:'desc'}}),prisma.collection.count({where})]);res.json({data,meta:{page,limit,total}})})); adminRouter.post('/collections',allow('OWNER','ADMIN','STAFF'),asyncRoute(async(req,res)=>{const d=z.object({name:z.string(),description:z.string().default(''),productIds:z.array(z.string()).default([]),status:status.optional()}).parse(req.body);res.status(201).json({data:await prisma.collection.create({data:{businessId:req.principal!.businessId,name:d.name,description:d.description,status:d.status,products:{create:d.productIds.map(productId=>({productId}))}},include:{products:true}})})}))
adminRouter.patch('/collections/:id',allow('OWNER','ADMIN','STAFF'),asyncRoute(async(req,res)=>{const d=z.object({name:z.string().optional(),description:z.string().optional(),status:status.optional()}).parse(req.body);const x=await prisma.collection.updateMany({where:{id:String(req.params.id),businessId:req.principal!.businessId},data:d});if(!x.count)throw new HttpError(404,'Collection not found','NOT_FOUND');res.status(204).end()}))
const catalogueInput=z.object({customerId:z.string().optional(),title:z.string(),message:z.string().optional(),expiresAt:z.coerce.date().optional(),status:status.optional(),showPrice:z.boolean().default(true),showExactStock:z.boolean().default(false),showAvailability:z.boolean().default(true),showMOQ:z.boolean().default(true),allowSelection:z.boolean().default(true),allowEnquiry:z.boolean().default(true),allowImageDownload:z.boolean().default(false),priceAdjustmentPct:z.number().min(-100).max(100).default(0),pin:z.string().min(4).optional(),items:z.array(z.object({productId:z.string(),variantId:z.string().optional(),customPrice:z.number().nonnegative().optional()})).min(1)})
// A catalogue may only reference the caller's own customer, products and variants (public links expose whatever the items point at).
const assertCatalogueRefsOwned=async(businessId:string,d:{customerId?:string;items?:{productId:string;variantId?:string}[]})=>{
  if(d.customerId&&!(await prisma.customer.findFirst({where:{id:d.customerId,businessId},select:{id:true}}))) throw new HttpError(400,'Customer not found','VALIDATION_ERROR')
  const items=d.items??[]
  if(!items.length) return
  const productIds=[...new Set(items.map(item=>item.productId))]
  if((await prisma.product.count({where:{id:{in:productIds},businessId}}))!==productIds.length) throw new HttpError(400,'One or more products are invalid','VALIDATION_ERROR')
  const variantIds=items.flatMap(item=>item.variantId?[item.variantId]:[])
  if(variantIds.length){
    const owners=new Map((await prisma.productVariant.findMany({where:{id:{in:variantIds},product:{businessId}},select:{id:true,productId:true}})).map(v=>[v.id,v.productId]))
    for(const item of items) if(item.variantId&&owners.get(item.variantId)!==item.productId) throw new HttpError(400,'One or more variants are invalid','VALIDATION_ERROR')
  }
}
adminRouter.get('/catalogues',asyncRoute(async(req,res)=>{const {page,limit,skip}=pagination(req),q=String(req.query.q??'');const where:any={businessId:req.principal!.businessId,...(q?{title:{contains:q,mode:'insensitive'}}:{})};const [data,total]=await prisma.$transaction([prisma.catalogue.findMany({where,skip,take:limit,include:{items:true},orderBy:{createdAt:'desc'}}),prisma.catalogue.count({where})]);res.json({data,meta:{page,limit,total}})})); adminRouter.post('/catalogues',allow('OWNER','ADMIN','STAFF','SALES'),asyncRoute(async(req,res)=>{const d=catalogueInput.parse(req.body);await assertCatalogueRefsOwned(req.principal!.businessId,d);const token=crypto.randomBytes(24).toString('base64url');const pinHash=d.pin?await (await import('argon2')).default.hash(d.pin):undefined;const catalogue=await prisma.catalogue.create({data:{...d,pin:undefined,pinHash,businessId:req.principal!.businessId,token,items:{create:d.items}},include:{items:true}});await prisma.auditLog.create({data:{businessId:req.principal!.businessId,actorId:req.principal!.id,action:'CATALOGUE_CREATED',entity:'Catalogue',entityId:catalogue.id}});res.status(201).json({data:catalogue})}))
adminRouter.post('/catalogues/:id/disable',allow('OWNER','ADMIN'),asyncRoute(async(req,res)=>{const r=await prisma.catalogue.updateMany({where:{id:String(req.params.id),businessId:req.principal!.businessId},data:{status:'DISABLED'}});if(!r.count)throw new HttpError(404,'Catalogue not found','NOT_FOUND');await prisma.auditLog.create({data:{businessId:req.principal!.businessId,actorId:req.principal!.id,action:'CATALOGUE_DISABLED',entity:'Catalogue',entityId:String(req.params.id)}});res.status(204).end()}))
adminRouter.patch('/catalogues/:id',allow('OWNER','ADMIN','STAFF','SALES'),asyncRoute(async(req,res)=>{const d=catalogueInput.partial().parse(req.body);await assertCatalogueRefsOwned(req.principal!.businessId,d);const x=await prisma.catalogue.updateMany({where:{id:String(req.params.id),businessId:req.principal!.businessId},data:{...d,items:undefined,pin:undefined}});if(!x.count)throw new HttpError(404,'Catalogue not found','NOT_FOUND');res.status(204).end()})); adminRouter.delete('/catalogues/:id',allow('OWNER','ADMIN'),asyncRoute(async(req,res)=>{const x=await prisma.catalogue.deleteMany({where:{id:String(req.params.id),businessId:req.principal!.businessId}});if(!x.count)throw new HttpError(404,'Catalogue not found','NOT_FOUND');res.status(204).end()}))
adminRouter.get('/enquiries',asyncRoute(async(req,res)=>{const {page,limit,skip}=pagination(req);const where={businessId:req.principal!.businessId,...(req.query.status?{status:String(req.query.status) as any}:{})};const [data,total]=await prisma.$transaction([prisma.enquiry.findMany({where,skip,take:limit,include:{items:true,customer:true},orderBy:{createdAt:'desc'}}),prisma.enquiry.count({where})]);res.json({data,meta:{page,limit,total}})})); adminRouter.patch('/enquiries/:id/status',allow('OWNER','ADMIN','STAFF','SALES'),asyncRoute(async(req,res)=>{const d=z.object({status:z.enum(['NEW','CONTACTED','NEGOTIATING','CONVERTED','CLOSED']),note:z.string().optional()}).parse(req.body);const x=await prisma.enquiry.updateMany({where:{id:String(req.params.id),businessId:req.principal!.businessId},data:{status:d.status}});if(!x.count)throw new HttpError(404,'Enquiry not found','NOT_FOUND');await prisma.enquiryStatusHistory.create({data:{enquiryId:String(req.params.id),...d}});res.status(204).end()}))

