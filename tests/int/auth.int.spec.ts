import { describe, expect, it } from 'vitest'

import { demoEmail } from '@/seed/index'
import { demoUser, PASSWORD, payloadClient } from './helpers'

describe('Authentication (mock PSU auth = Payload local auth)', () => {
  it('logs in a demo account and resolves the user from the JWT', async () => {
    const payload = await payloadClient()
    const result = await payload.login({
      collection: 'users',
      data: { email: demoEmail('personnel'), password: PASSWORD() },
    })
    expect(result.token).toBeTruthy()
    const headers = new Headers({ Authorization: `JWT ${result.token}` })
    const { user } = await payload.auth({ headers })
    expect(user?.email).toBe(demoEmail('personnel'))
  })

  it('rejects a wrong password', async () => {
    const payload = await payloadClient()
    await expect(
      payload.login({ collection: 'users', data: { email: demoEmail('personnel'), password: 'wrong-password' } }),
    ).rejects.toThrow()
  })

  it('blocks suspended accounts from logging in', async () => {
    const payload = await payloadClient()
    const u = await payload.create({
      collection: 'users',
      data: { email: 'suspended@demo.psu.local', password: PASSWORD(), name: 'ผู้ใช้ถูกระงับ (ทดสอบ)', status: 'SUSPENDED' },
      overrideAccess: true,
    })
    await expect(
      payload.login({ collection: 'users', data: { email: 'suspended@demo.psu.local', password: PASSWORD() } }),
    ).rejects.toThrow()
    await payload.delete({ collection: 'users', id: u.id, overrideAccess: true })
  })

  it('denies anonymous access to the users collection', async () => {
    const payload = await payloadClient()
    await expect(payload.find({ collection: 'users', overrideAccess: false })).rejects.toThrow()
  })

  it('does not allow self-registration (create requires an admin)', async () => {
    const payload = await payloadClient()
    const personnel = await demoUser('personnel')
    await expect(
      payload.create({
        collection: 'users',
        data: { email: 'new@demo.psu.local', password: PASSWORD(), name: 'ใหม่' },
        overrideAccess: false,
        user: personnel,
      }),
    ).rejects.toThrow()
  })
})
