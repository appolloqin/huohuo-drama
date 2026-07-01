/**
 * 微信小程序 code 登录 / 自动注册
 */
import { randomBytes } from 'node:crypto'
import { hashPassword } from '../../common/auth/password.js'
import { signJwt, getJwtSecret } from '../../common/auth/jwt-token.js'
import { now } from '../../common/http/response.js'
import * as usersRepo from '../../db/repos/users/index.js'
import { getCurrentUserProfile } from '../auth/auth-service.js'
import { resolveWechatMiniCredentials } from './mobile-config-service.js'

const JWT_TTL_SEC = 7 * 24 * 3600

type JsCode2Session = {
  openid?: string
  session_key?: string
  unionid?: string
  errcode?: number
  errmsg?: string
}

export class MobileAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MobileAuthError'
  }
}

async function exchangeWechatCode(code: string): Promise<{ openid: string; unionid?: string }> {
  const { appId, secret } = resolveWechatMiniCredentials()
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
  url.searchParams.set('appid', appId)
  url.searchParams.set('secret', secret)
  url.searchParams.set('js_code', code)
  url.searchParams.set('grant_type', 'authorization_code')

  const resp = await fetch(url.toString())
  const json = await resp.json().catch(() => ({} as JsCode2Session))
  if (!json.openid) {
    throw new MobileAuthError(json.errmsg || `微信登录失败(${json.errcode ?? resp.status})`)
  }
  return { openid: json.openid, unionid: json.unionid }
}

function issueToken(user: { id: number; username: string; role: string }) {
  return signJwt(
    { sub: user.id, username: user.username, role: user.role },
    getJwtSecret(),
    JWT_TTL_SEC,
  )
}

function randomMpUsername(openid: string) {
  const tail = openid.replace(/\W/g, '').slice(-8) || randomBytes(4).toString('hex')
  return `mp_${tail}_${randomBytes(2).toString('hex')}`
}

export async function loginWithWechatMiniProgramCode(code: string) {
  const trimmed = String(code || '').trim()
  if (!trimmed) throw new MobileAuthError('缺少微信 code')

  const { openid, unionid } = await exchangeWechatCode(trimmed)
  const ts = now()

  let row = await usersRepo.findUserByWechatMpOpenid(openid)
  let isNewUser = false
  if (!row) {
    isNewUser = true
    const passwordHash = hashPassword(randomBytes(24).toString('hex'))
    let username = randomMpUsername(openid)
    for (let i = 0; i < 5; i += 1) {
      try {
        const res = await usersRepo.insertUser({
          username,
          passwordHash,
          role: 'user',
          credits: 0,
          createdAt: ts,
          updatedAt: ts,
        })
        const id = Number(res.lastInsertRowid)
        await usersRepo.updateUserWechatIdentity(id, {
          wechatMpOpenid: openid,
          wechatUnionid: unionid || null,
        }, ts)
        row = await usersRepo.findUserById(id)
        break
      } catch {
        username = randomMpUsername(openid)
      }
    }
    if (!row) throw new MobileAuthError('创建微信用户失败')
  } else if (unionid && row.wechatUnionid !== unionid) {
    await usersRepo.updateUserWechatIdentity(row.id, { wechatUnionid: unionid }, ts)
    row = await usersRepo.findUserById(row.id)
  }

  if (!row) throw new MobileAuthError('用户不存在')

  const token = issueToken({ id: row.id, username: row.username, role: row.role })
  const user = await getCurrentUserProfile(row.id, row.username, row.role)
  return {
    token,
    user,
    wechat_mp_openid: openid,
    is_new_user: isNewUser,
  }
}

export async function bindWechatMiniProgramCode(userId: number, code: string) {
  const { openid, unionid } = await exchangeWechatCode(code)
  const existing = await usersRepo.findUserByWechatMpOpenid(openid)
  if (existing && existing.id !== userId) {
    throw new MobileAuthError('该微信已绑定其他账号')
  }
  const ts = now()
  await usersRepo.updateUserWechatIdentity(userId, {
    wechatMpOpenid: openid,
    wechatUnionid: unionid || null,
  }, ts)
  const row = await usersRepo.findUserById(userId)
  if (!row) throw new MobileAuthError('用户不存在')
  return { ok: true, wechat_mp_openid: openid }
}
