import { PrismaClient, AttributeKind, CustomerType, RecordStatus, Role } from '@prisma/client'
import argon2 from 'argon2'
const db = new PrismaClient()
async function main() {
  const business = await db.business.upsert({ where:{slug:'vastraa-wholesale'}, update:{}, create:{name:'Vastraa Wholesale',slug:'vastraa-wholesale'} })
  const passwordHash = await argon2.hash(process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!', {type:argon2.argon2id})
  const admin = await db.user.upsert({where:{businessId_email:{businessId:business.id,email:'admin@vastraa.demo'}},update:{},create:{businessId:business.id,name:'Amit Shah',email:'admin@vastraa.demo',passwordHash,role:Role.OWNER}})
  const category = await db.category.upsert({where:{businessId_slug:{businessId:business.id,slug:'kurtis'}},update:{},create:{businessId:business.id,name:'Kurtis',slug:'kurtis'}})
  const fabric = await db.attribute.upsert({where:{businessId_name:{businessId:business.id,name:'Fabric'}},update:{},create:{businessId:business.id,name:'Fabric',kind:AttributeKind.SELECT,values:{create:{value:'Rayon'}}}})
  const color = await db.attribute.upsert({where:{businessId_name:{businessId:business.id,name:'Color'}},update:{},create:{businessId:business.id,name:'Color',kind:AttributeKind.COLOR,values:{create:[{value:'Maroon',hex:'#800000'},{value:'Black',hex:'#000000'}]}}})
  const size = await db.attribute.upsert({where:{businessId_name:{businessId:business.id,name:'Size'}},update:{},create:{businessId:business.id,name:'Size',kind:AttributeKind.SIZE,values:{create:[{value:'L'},{value:'XL'}]}}})
  const product = await db.product.upsert({where:{businessId_code:{businessId:business.id,code:'K-101'}},update:{},create:{businessId:business.id,categoryId:category.id,code:'K-101',name:'Floral Rayon Straight Kurti',description:'Demo bestseller',basePrice:425,moq:12,status:RecordStatus.ACTIVE,attributes:{create:[{attributeId:fabric.id},{attributeId:color.id},{attributeId:size.id}]}}})
  const values = await db.attributeValue.findMany({where:{attributeId:{in:[fabric.id,color.id,size.id]}}})
  for(const [sku,colour,fit,stock] of [['K-101-BLK-XL','Black','XL',40],['K-101-MAR-L','Maroon','L',36]] as const) { const variant=await db.productVariant.upsert({where:{productId_sku:{productId:product.id,sku}},update:{stock},create:{productId:product.id,sku,price:425,stock}}); for(const value of ['Rayon',colour,fit]) {const attributeValue=values.find(v=>v.value===value)!;await db.variantAttributeValue.upsert({where:{variantId_attributeValueId:{variantId:variant.id,attributeValueId:attributeValue.id}},update:{},create:{variantId:variant.id,attributeValueId:attributeValue.id}})} }
  const customer = await db.customer.upsert({where:{id:'seed-raj-fashion-house'},update:{},create:{id:'seed-raj-fashion-house',businessId:business.id,businessName:'Raj Fashion House',contactPerson:'Rajesh Kumar',phone:'+919820011223',type:CustomerType.WHOLESALER}})
  const collection = await db.collection.upsert({where:{businessId_name:{businessId:business.id,name:'September New Arrivals'}},update:{},create:{businessId:business.id,name:'September New Arrivals',description:'Vastraa demo collection'}})
  await db.collectionProduct.upsert({where:{collectionId_productId:{collectionId:collection.id,productId:product.id}},update:{},create:{collectionId:collection.id,productId:product.id}})
  await db.catalogue.upsert({where:{token:'vastraa-demo-catalogue'},update:{status:RecordStatus.ACTIVE},create:{businessId:business.id,customerId:customer.id,title:'September New Arrivals',token:'vastraa-demo-catalogue',status:RecordStatus.ACTIVE,items:{create:{productId:product.id}}}})
  console.log(`Seeded Vastraa demo for ${admin.email}`)
}
main().finally(()=>db.$disconnect())
