import { Router } from 'express'
import { z } from 'zod'
import { prisma } from './db.js'
import { allow, requireAuth } from './auth.js'
import { HttpError, asyncRoute, pagination } from './http.js'
import { moveInventory } from './inventory.js'
import crypto from 'node:crypto'
import multer from 'multer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from './config.js'
import {
  assertAllowedValuesNotInUse, assertAttributeValueUnused, assertUniqueVariantCombination,
  assertVariantAttributeValues, isUniqueConstraint, productInclude, resolveProductAttributeSelection,
} from './productAttributes.js'

const status=z.enum(['ACTIVE','INACTIVE','DRAFT','ARCHIVED','DISABLED','EXPIRED'])
const list=(model:any, searchField?:string)=>asyncRoute(async(req,res)=>{const {page,limit,skip}=pagination(req), q=String(req.query.q??'');const where:any={businessId:req.principal!.businessId,...(q&&searchField?{[searchField]:{contains:q,mode:'insensitive'}}:{})};const [items,total]=await prisma.$transaction([model.findMany({where,skip,take:limit,orderBy:{createdAt:'desc'}}),model.count({where})]);res.json({data:items,meta:{page,limit,total}})})
export const adminRouter=Router(); adminRouter.use(requireAuth)
const categoryInput=z.object({name:z.string().min(2),slug:z.string().regex(/^[a-z0-9-]+$/),status:status.optional(),attributeIds:z.array(z.string()).optional()})
adminRouter.get('/categories',asyncRoute(async(req,res)=>{const {page,limit,skip}=pagination(req),q=String(req.query.q??'');const where:any={businessId:req.principal!.businessId,...(q?{name:{contains:q,mode:'insensitive'}}:{})};const [data,total]=await prisma.$transaction([prisma.category.findMany({where,skip,take:limit,include:{categoryAttributes:true},orderBy:{createdAt:'desc'}}),prisma.category.count({where})]);res.json({data,meta:{page,limit,total}})}))
adminRouter.post('/categories',allow('OWNER','ADMIN'),asyncRoute(async(req,res)=>{const d=categoryInput.parse(req.body);const attributeIds=d.attributeIds??[];if(attributeIds.length){const attrs=await prisma.attribute.findMany({where:{id:{in:attributeIds},businessId:req.principal!.businessId}});if(attrs.length!==attributeIds.length)throw new HttpError(400,'One or more attributes are invalid','VALIDATION_ERROR')}res.status(201).json({data:await prisma.category.create({data:{name:d.name,slug:d.slug,status:d.status,businessId:req.principal!.businessId,categoryAttributes:{create:attributeIds.map(attributeId=>({attributeId}))}},include:{categoryAttributes:true}})})}))
adminRouter.patch('/categories/:id',allow('OWNER','ADMIN'),asyncRoute(async(req,res)=>{const d=categoryInput.partial().parse(req.body);const existing=await prisma.category.findFirst({where:{id:String(req.params.id),businessId:req.principal!.businessId}});if(!existing)throw new HttpError(404,'Category not found','NOT_FOUND');if(d.attributeIds){const attrs=await prisma.attribute.findMany({where:{id:{in:d.attributeIds},businessId:req.principal!.businessId}});if(attrs.length!==d.attributeIds.length)throw new HttpError(400,'One or more attributes are invalid','VALIDATION_ERROR')}const category=await prisma.$transaction(async(tx)=>{if(d.attributeIds){await tx.categoryAttribute.deleteMany({where:{categoryId:existing.id}});await tx.categoryAttribute.createMany({data:d.attributeIds.map(attributeId=>({categoryId:existing.id,attributeId}))})}const {attributeIds:_ignored,...rest}=d;return tx.category.update({where:{id:existing.id},data:rest,include:{categoryAttributes:true}})});res.json({data:category})}))
adminRouter.delete('/categories/:id',allow('OWNER','ADMIN'),asyncRoute(async(req,res)=>{const existing=await prisma.category.findFirst({where:{id:String(req.params.id),businessId:req.principal!.businessId},include:{_count:{select:{products:true}}}});if(!existing)throw new HttpError(404,'Category not found','NOT_FOUND');if(existing._count.products>0)throw new HttpError(409,'Category cannot be deleted while products still use it','CONFLICT');await prisma.category.delete({where:{id:existing.id}});res.status(204).end()}))
adminRouter.get('/attributes',asyncRoute(async(req,res)=>res.json({data:await prisma.attribute.findMany({where:{businessId:req.principal!.businessId},include:{values:true},orderBy:{createdAt:'desc'}})})))
adminRouter.post('/attributes',allow('OWNER','ADMIN'),asyncRoute(async(req,res)=>{const d=z.object({name:z.string().min(1),kind:z.enum(['COLOR','TEXT','SIZE','SELECT']),values:z.array(z.object({value:z.string().min(1),hex:z.string().optional()})).default([])}).parse(req.body);res.status(201).json({data:await prisma.attribute.create({data:{businessId:req.principal!.businessId,name:d.name,kind:d.kind,values:{create:d.values}},include:{values:true}})})}))
adminRouter.patch('/attributes/:id',allow('OWNER','ADMIN'),asyncRoute(async(req,res)=>{const d=z.object({name:z.string().min(1).optional(),kind:z.enum(['COLOR','TEXT','SIZE','SELECT']).optional()}).parse(req.body);const updated=await prisma.attribute.updateMany({where:{id:String(req.params.id),businessId:req.principal!.businessId},data:d});if(!updated.count)throw new HttpError(404,'Attribute not found','NOT_FOUND');res.json({data:await prisma.attribute.findFirst({where:{id:String(req.params.id),businessId:req.principal!.businessId},include:{values:true}})})}))
adminRouter.post('/attributes/:id/values',allow('OWNER','ADMIN'),asyncRoute(async(req,res)=>{const d=z.object({value:z.string().min(1),hex:z.string().optional()}).parse(req.body);const attribute=await prisma.attribute.findFirst({where:{id:String(req.params.id),businessId:req.principal!.businessId}});if(!attribute)throw new HttpError(404,'Attribute not found','NOT_FOUND');try{res.status(201).json({data:await prisma.attributeValue.create({data:{attributeId:attribute.id,...d}})})}catch(error){if(isUniqueConstraint(error))throw new HttpError(409,'That value already exists on this attribute','CONFLICT');throw error}}))
adminRouter.delete('/attributes/:id/values/:valueId',allow('OWNER','ADMIN'),asyncRoute(async(req,res)=>{const attribute=await prisma.attribute.findFirst({where:{id:String(req.params.id),businessId:req.principal!.businessId}});if(!attribute)throw new HttpError(404,'Attribute not found','NOT_FOUND');await assertAttributeValueUnused(req.principal!.businessId,String(req.params.valueId));await prisma.attributeValue.delete({where:{id:String(req.params.valueId)}});res.status(204).end()}))
adminRouter.get('/customers',list(prisma.customer,'businessName')); adminRouter.post('/customers',allow('OWNER','ADMIN','STAFF','SALES'),asyncRoute(async(req,res)=>{const d=z.object({businessName:z.string(),contactPerson:z.string(),phone:z.string(),whatsapp:z.string().optional(),email:z.string().email().optional(),city:z.string().optional(),state:z.string().optional(),type:z.enum(['WHOLESALER','RETAILER','DISTRIBUTOR','RESELLER']),gstNumber:z.string().optional(),notes:z.string().optional(),status:status.optional()}).parse(req.body);res.status(201).json({data:await prisma.customer.create({data:{...d,businessId:req.principal!.businessId}})})}))
adminRouter.get('/customers/:id',asyncRoute(async(req,res)=>{const x=await prisma.customer.findFirst({where:{id:String(req.params.id),businessId:req.principal!.businessId}});if(!x)throw new HttpError(404,'Customer not found','NOT_FOUND');res.json({data:x})})); adminRouter.patch('/customers/:id',allow('OWNER','ADMIN','STAFF','SALES'),asyncRoute(async(req,res)=>{const d=z.object({businessName:z.string().optional(),contactPerson:z.string().optional(),phone:z.string().optional(),status:status.optional(),notes:z.string().optional()}).parse(req.body);const x=await prisma.customer.updateMany({where:{id:String(req.params.id),businessId:req.principal!.businessId},data:d});if(!x.count)throw new HttpError(404,'Customer not found','NOT_FOUND');res.status(204).end()}))
const variantInput=z.object({sku:z.string().min(1),price:z.number().nonnegative(),stock:z.number().int().nonnegative().optional(),attributeValueIds:z.array(z.string()).optional(),attributeAssignments:z.array(z.object({attributeId:z.string(),attributeValueId:z.string()})).optional()})
const productInput=z.object({categoryId:z.string(),code:z.string().min(1),name:z.string().min(1),description:z.string().default(''),basePrice:z.number().nonnegative(),moq:z.number().int().positive().default(1),status:status.optional(),attributeIds:z.array(z.string()).optional(),allowedAttributeValueIds:z.array(z.string()).optional(),media:z.array(z.object({objectKey:z.string(),url:z.string(),mimeType:z.string(),primary:z.boolean().optional(),sortOrder:z.number().int().optional()})).default([]),variants:z.array(variantInput).optional()})
adminRouter.get('/products',asyncRoute(async(req,res)=>{const {page,limit,skip}=pagination(req),q=String(req.query.q??'');const where={businessId:req.principal!.businessId,...(q?{OR:[{name:{contains:q,mode:'insensitive' as const}},{code:{contains:q,mode:'insensitive' as const}}]}:{})};const [data,total]=await prisma.$transaction([prisma.product.findMany({where,skip,take:limit,include:productInclude,orderBy:{createdAt:'desc'}}),prisma.product.count({where})]);res.json({data,meta:{page,limit,total}})}))
adminRouter.post('/products',allow('OWNER','ADMIN','STAFF'),asyncRoute(async(req,res)=>{
  const d=productInput.parse(req.body)
  const allowedAttributeValueIds=d.allowedAttributeValueIds??[]
  const attributeIds=d.attributeIds??[]
  const variants=d.variants??[]
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
      media:{create:d.media},
      attributes:{create:selection.attributeIds.map(attributeId=>({attributeId}))},
      allowedValues:{create:allowedAttributeValueIds.map(attributeValueId=>({attributeValueId}))},
      variants:{create:variants.map(v=>({sku:v.sku,price:v.price,stock:v.stock??0,attributeValues:{create:(v.attributeValueIds??[]).map(attributeValueId=>({attributeValueId}))}}))},
    },include:productInclude})
    res.status(201).json({data:product})
  }catch(error){
    if(isUniqueConstraint(error)) throw new HttpError(409,'A product or SKU with that code already exists','CONFLICT')
    throw error
  }
}))
adminRouter.get('/products/:id',asyncRoute(async(req,res)=>{const x=await prisma.product.findFirst({where:{id:String(req.params.id),businessId:req.principal!.businessId},include:productInclude});if(!x)throw new HttpError(404,'Product not found','NOT_FOUND');res.json({data:x})}))
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
    await prisma.$transaction(async(tx)=>{
      await tx.productAttribute.deleteMany({where:{productId:product.id}})
      await tx.productAttributeValue.deleteMany({where:{productId:product.id}})
      if(selection.attributeIds.length) await tx.productAttribute.createMany({data:selection.attributeIds.map(attributeId=>({productId:product.id,attributeId}))})
      if(nextAllowed.length) await tx.productAttributeValue.createMany({data:nextAllowed.map(attributeValueId=>({productId:product.id,attributeValueId}))})
      await tx.product.update({where:{id:product.id},data:{...(d.name!==undefined?{name:d.name}:{}),...(d.description!==undefined?{description:d.description}:{}),...(d.basePrice!==undefined?{basePrice:d.basePrice}:{}),...(d.moq!==undefined?{moq:d.moq}:{}),...(d.status!==undefined?{status:d.status}:{}),...(d.categoryId!==undefined?{categoryId:d.categoryId}:{}),...(d.code!==undefined?{code:d.code}:{})}})
    })
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
const allowedMime=new Set(['image/jpeg','image/png','image/webp','image/gif'])
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:config.uploadMaxBytes,files:1},fileFilter:(_req,file,cb)=>cb(null,allowedMime.has(file.mimetype))})
adminRouter.post('/media',allow('OWNER','ADMIN','STAFF'),upload.single('file'),asyncRoute(async(req,res)=>{if(config.uploadProvider!=='local')throw new HttpError(501,'Configured upload provider is not available','UPLOAD_UNAVAILABLE');if(!req.file)throw new HttpError(400,'A supported image file is required','VALIDATION_ERROR');const ext=({ 'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif'} as Record<string,string>)[req.file.mimetype];const objectKey=`${req.principal!.businessId}/${crypto.randomUUID()}${ext}`;const destination=path.resolve(config.uploadDir,objectKey);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,req.file.buffer,{flag:'wx'});res.status(201).json({data:{objectKey,url:`/api/v1/media/${objectKey}`,mimeType:req.file.mimetype}})}))
adminRouter.get('/collections',asyncRoute(async(req,res)=>{const {page,limit,skip}=pagination(req),q=String(req.query.q??'');const where:any={businessId:req.principal!.businessId,...(q?{name:{contains:q,mode:'insensitive'}}:{})};const [data,total]=await prisma.$transaction([prisma.collection.findMany({where,skip,take:limit,include:{products:true},orderBy:{createdAt:'desc'}}),prisma.collection.count({where})]);res.json({data,meta:{page,limit,total}})})); adminRouter.post('/collections',allow('OWNER','ADMIN','STAFF'),asyncRoute(async(req,res)=>{const d=z.object({name:z.string(),description:z.string().default(''),productIds:z.array(z.string()).default([]),status:status.optional()}).parse(req.body);res.status(201).json({data:await prisma.collection.create({data:{businessId:req.principal!.businessId,name:d.name,description:d.description,status:d.status,products:{create:d.productIds.map(productId=>({productId}))}},include:{products:true}})})}))
adminRouter.patch('/collections/:id',allow('OWNER','ADMIN','STAFF'),asyncRoute(async(req,res)=>{const d=z.object({name:z.string().optional(),description:z.string().optional(),status:status.optional()}).parse(req.body);const x=await prisma.collection.updateMany({where:{id:String(req.params.id),businessId:req.principal!.businessId},data:d});if(!x.count)throw new HttpError(404,'Collection not found','NOT_FOUND');res.status(204).end()}))
const catalogueInput=z.object({customerId:z.string().optional(),title:z.string(),message:z.string().optional(),expiresAt:z.coerce.date().optional(),status:status.optional(),showPrice:z.boolean().default(true),showExactStock:z.boolean().default(false),showAvailability:z.boolean().default(true),showMOQ:z.boolean().default(true),allowSelection:z.boolean().default(true),allowEnquiry:z.boolean().default(true),allowImageDownload:z.boolean().default(false),priceAdjustmentPct:z.number().min(-100).max(100).default(0),pin:z.string().min(4).optional(),items:z.array(z.object({productId:z.string(),variantId:z.string().optional(),customPrice:z.number().nonnegative().optional()})).min(1)})
adminRouter.get('/catalogues',asyncRoute(async(req,res)=>{const {page,limit,skip}=pagination(req),q=String(req.query.q??'');const where:any={businessId:req.principal!.businessId,...(q?{title:{contains:q,mode:'insensitive'}}:{})};const [data,total]=await prisma.$transaction([prisma.catalogue.findMany({where,skip,take:limit,include:{items:true},orderBy:{createdAt:'desc'}}),prisma.catalogue.count({where})]);res.json({data,meta:{page,limit,total}})})); adminRouter.post('/catalogues',allow('OWNER','ADMIN','STAFF','SALES'),asyncRoute(async(req,res)=>{const d=catalogueInput.parse(req.body);const token=crypto.randomBytes(24).toString('base64url');const pinHash=d.pin?await (await import('argon2')).default.hash(d.pin):undefined;const catalogue=await prisma.catalogue.create({data:{...d,pin:undefined,pinHash,businessId:req.principal!.businessId,token,items:{create:d.items}},include:{items:true}});await prisma.auditLog.create({data:{businessId:req.principal!.businessId,actorId:req.principal!.id,action:'CATALOGUE_CREATED',entity:'Catalogue',entityId:catalogue.id}});res.status(201).json({data:catalogue})}))
adminRouter.post('/catalogues/:id/disable',allow('OWNER','ADMIN'),asyncRoute(async(req,res)=>{const r=await prisma.catalogue.updateMany({where:{id:String(req.params.id),businessId:req.principal!.businessId},data:{status:'DISABLED'}});if(!r.count)throw new HttpError(404,'Catalogue not found','NOT_FOUND');await prisma.auditLog.create({data:{businessId:req.principal!.businessId,actorId:req.principal!.id,action:'CATALOGUE_DISABLED',entity:'Catalogue',entityId:String(req.params.id)}});res.status(204).end()}))
adminRouter.patch('/catalogues/:id',allow('OWNER','ADMIN','STAFF','SALES'),asyncRoute(async(req,res)=>{const d=catalogueInput.partial().parse(req.body);const x=await prisma.catalogue.updateMany({where:{id:String(req.params.id),businessId:req.principal!.businessId},data:{...d,items:undefined,pin:undefined}});if(!x.count)throw new HttpError(404,'Catalogue not found','NOT_FOUND');res.status(204).end()})); adminRouter.delete('/catalogues/:id',allow('OWNER','ADMIN'),asyncRoute(async(req,res)=>{const x=await prisma.catalogue.deleteMany({where:{id:String(req.params.id),businessId:req.principal!.businessId}});if(!x.count)throw new HttpError(404,'Catalogue not found','NOT_FOUND');res.status(204).end()}))
adminRouter.get('/enquiries',asyncRoute(async(req,res)=>{const {page,limit,skip}=pagination(req);const where={businessId:req.principal!.businessId,...(req.query.status?{status:String(req.query.status) as any}:{})};const [data,total]=await prisma.$transaction([prisma.enquiry.findMany({where,skip,take:limit,include:{items:true,customer:true},orderBy:{createdAt:'desc'}}),prisma.enquiry.count({where})]);res.json({data,meta:{page,limit,total}})})); adminRouter.patch('/enquiries/:id/status',allow('OWNER','ADMIN','STAFF','SALES'),asyncRoute(async(req,res)=>{const d=z.object({status:z.enum(['NEW','CONTACTED','NEGOTIATING','CONVERTED','CLOSED']),note:z.string().optional()}).parse(req.body);const x=await prisma.enquiry.updateMany({where:{id:String(req.params.id),businessId:req.principal!.businessId},data:{status:d.status}});if(!x.count)throw new HttpError(404,'Enquiry not found','NOT_FOUND');await prisma.enquiryStatusHistory.create({data:{enquiryId:String(req.params.id),...d}});res.status(204).end()}))

