import crypto from 'node:crypto'
import argon2 from 'argon2'
import type { NextFunction, Request, Response } from 'express'
import { prisma } from './db.js'
import { config } from './config.js'
import { HttpError, asyncRoute } from './http.js'
import { Router } from 'express'
import { z } from 'zod'
export type Principal={id:string; businessId:string; role:string; name:string; email:string}
declare global { namespace Express { interface Request { principal?: Principal } } }
const token=()=>crypto.randomBytes(32).toString('base64url'); const digest=(x:string)=>crypto.createHash('sha256').update(x).digest('hex')
const cookie={httpOnly:true,secure:config.cookieSecure,sameSite:'lax' as const,path:'/api',maxAge:config.sessionDays*86400000}
export const requireAuth=asyncRoute(async(req,_res,next)=>{ const raw=req.cookies.vw_session; if(!raw) throw new HttpError(401,'Authentication required','UNAUTHENTICATED'); const session=await prisma.session.findUnique({where:{tokenHash:digest(raw)},include:{user:true}}); if(!session||session.expiresAt<new Date()||!session.user.active) throw new HttpError(401,'Session expired','UNAUTHENTICATED'); req.principal={id:session.user.id,businessId:session.user.businessId,role:session.user.role,name:session.user.name,email:session.user.email}; next() })
export const allow=(...roles:string[]) => (req:Request,_res:Response,next:NextFunction) => { if(!req.principal||!roles.includes(req.principal.role)) return next(new HttpError(403,'Insufficient permission','FORBIDDEN')); next() }
export const authRouter=Router()
authRouter.post('/login', asyncRoute(async(req,res)=>{ const data=z.object({email:z.string().email(),password:z.string().min(8)}).parse(req.body); const user=await prisma.user.findFirst({where:{email:data.email,active:true}}); if(!user||!(await argon2.verify(user.passwordHash,data.password))) throw new HttpError(401,'Invalid email or password','INVALID_CREDENTIALS'); const raw=token(); await prisma.session.create({data:{userId:user.id,tokenHash:digest(raw),expiresAt:new Date(Date.now()+cookie.maxAge)}}); res.cookie('vw_session',raw,cookie).json({data:{user:{id:user.id,name:user.name,email:user.email,role:user.role,businessId:user.businessId}}}) }))
authRouter.post('/logout', requireAuth, asyncRoute(async(req,res)=>{await prisma.session.deleteMany({where:{tokenHash:digest(req.cookies.vw_session)}});res.clearCookie('vw_session',{path:'/api'}).status(204).end()}))
authRouter.get('/me',requireAuth,(req,res)=>res.json({data:{user:req.principal}}))
