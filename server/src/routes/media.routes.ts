import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import sharp from 'sharp'
import { env } from '../lib/env.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { Errors } from '../utils/errors.js'
import { requireAuth } from '../middleware/auth.js'

export const mediaRouter = Router()
mediaRouter.use(requireAuth)

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

fs.mkdirSync(env.MEDIA_DIR, { recursive: true })

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    // Validate by declared mimetype here; magic-byte sniffing happens below via sharp,
    // which will throw on anything that isn't actually a decodable image.
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error('Unsupported file type'))
    cb(null, true)
  },
})

mediaRouter.post(
  '/upload',
  upload.array('files', 10),
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    if (files.length === 0) throw Errors.badRequest('No files uploaded')

    const results = await Promise.all(
      files.map(async (file) => {
        // Re-encoding via sharp both strips EXIF/metadata and rejects files that aren't
        // genuinely decodable images, closing the "renamed .php as .jpg" upload attack.
        let image = sharp(file.buffer, { failOn: 'error' })
        const metadata = await image.metadata()
        if (!metadata.width || !metadata.height) throw Errors.badRequest(`${file.originalname} is not a valid image`)

        if (metadata.width > 2000) image = image.resize({ width: 2000 })
        const filename = `${crypto.randomUUID()}.webp`
        const outPath = path.join(env.MEDIA_DIR, filename)
        await image.webp({ quality: 85 }).toFile(outPath)

        return { url: `${env.MEDIA_PUBLIC_URL}/${filename}`, originalName: file.originalname }
      }),
    )

    res.status(201).json({ files: results })
  }),
)
