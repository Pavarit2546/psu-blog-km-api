import { APIError, type PayloadRequest } from 'payload'

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

export function errorResponse(req: PayloadRequest, error: unknown) {
  if (error instanceof APIError && error.isPublic) {
    return json({ errors: [{ message: error.message }] }, error.status)
  }
  req.payload.logger.error({ err: error, msg: 'custom endpoint failed' })
  return json({ errors: [{ message: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' }] }, 500)
}
