import { Router } from 'express'
import { z } from 'zod'
import { prisma } from './db.js'
import { asyncRoute, HttpError } from './http.js'
import crypto from 'node:crypto'
export const publicRouter=Router()
const liveCatalogue=async(token:string)=>{
  const c=await prisma.catalogue.findUnique({where:{token},include:{items:{include:{product:{include:{media:true,variants:{include:{attributeValues:{include:{attributeValue:{include:{attribute:true}}}}}}}}}}}})
  if(!c||c.status!=='ACTIVE'||(c.expiresAt&&c.expiresAt<new Date()))throw new HttpError(404,'Catalogue is unavailable','CATALOGUE_UNAVAILABLE')
  return c
}
const safe=(c:Awaited<ReturnType<typeof liveCatalogue>>)=>({
  token:c.token,title:c.title,message:c.message,expiresAt:c.expiresAt,
  settings:{showPrice:c.showPrice,showExactStock:c.showExactStock,showAvailability:c.showAvailability,showMOQ:c.showMOQ,allowSelection:c.allowSelection,allowEnquiry:c.allowEnquiry,allowImageDownload:c.allowImageDownload},
  products:c.items.map(i=>({
    id:i.product.id,code:i.product.code,name:i.product.name,description:i.product.description,moq:c.showMOQ?i.product.moq:undefined,
    media:i.product.media.map(m=>({url:m.url,primary:m.primary})),
    variants:(i.variantId?i.product.variants.filter(v=>v.id===i.variantId):i.product.variants).map(v=>({
      id:v.id,sku:v.sku,price:c.showPrice ? Number(i.customPrice ?? (Number(v.price) * (1 + Number(c.priceAdjustmentPct) / 100))) : undefined,
      stock:c.showExactStock?v.stock:undefined,available:c.showAvailability?v.stock-v.reserved>0:undefined,
      attributes:Object.fromEntries(v.attributeValues.map(a=>[a.attributeValue.attribute.name,a.attributeValue.value]))
    }))
  }))
})
publicRouter.get('/catalogues/:token',asyncRoute(async(req,res)=>{const c=await liveCatalogue(String(req.params.token));await prisma.analyticsEvent.create({data:{businessId:c.businessId,type:'CATALOGUE_VIEWED',catalogueId:c.id}});res.json({data:safe(c)})}))
publicRouter.post('/catalogues/:token/enquiries',asyncRoute(async(req,res)=>{const c=await liveCatalogue(String(req.params.token));if(!c.allowEnquiry)throw new HttpError(403,'Enquiries are disabled','FORBIDDEN');const d=z.object({contactName:z.string().min(2),phone:z.string().min(6),message:z.string().optional(),items:z.array(z.object({productId:z.string(),variantId:z.string(),quantity:z.number().int().positive()})).min(1)}).parse(req.body);const permitted=new Map(c.items.flatMap(i=>i.product.variants.filter(v=>!i.variantId||v.id===i.variantId).map(v=>[v.id,{product:i.product,variant:v,item:i}] as const)));const items=d.items.map(x=>{const found=permitted.get(x.variantId);if(!found||found.product.id!==x.productId)throw new HttpError(400,'Invalid catalogue item','VALIDATION_ERROR');return {productId:x.productId,variantId:x.variantId,quantity:x.quantity,skuSnapshot:found.variant.sku,attributesSnapshot:Object.fromEntries(found.variant.attributeValues.map(a=>[a.attributeValue.attribute.name,a.attributeValue.value])),priceSnapshot:found.item.customPrice??found.variant.price}});const reference=`ENQ-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;const enquiry=await prisma.enquiry.create({data:{businessId:c.businessId,catalogueId:c.id,customerId:c.customerId,reference,contactName:d.contactName,phone:d.phone,message:d.message,items:{create:items},history:{create:{status:'NEW'}}}});await prisma.analyticsEvent.create({data:{businessId:c.businessId,type:'ENQUIRY_SUBMITTED',catalogueId:c.id,metadata:{enquiryId:enquiry.id}}});res.status(201).json({data:{id:enquiry.id,reference:enquiry.reference,status:enquiry.status}})}))

