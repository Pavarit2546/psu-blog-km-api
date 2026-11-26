import type { User } from '@/payload-types'

export type AuthorDisplayMode = 'REAL_NAME' | 'PEN_NAME'

export type PublicAuthor = {
  name: string
  profile_key: string
  avatar: string | null
  department: string | null
  position: string | null
  is_pen_name: boolean
}

type AuthorSource = Pick<
  User,
  'name' | 'display_name' | 'pen_name' | 'public_key' | 'pen_key' | 'department' | 'position' | 'show_department' | 'avatar'
>

/**
 * Build the public projection of an author for a given display mode.
 * A pen-name projection never contains the real name, avatar, department
 * or the real-name profile key, so readers cannot link the two identities.
 */
export function buildPublicAuthor(user: AuthorSource, mode: AuthorDisplayMode): PublicAuthor {
  if (mode === 'PEN_NAME') {
    return {
      name: user.pen_name?.trim() || 'ผู้เขียนนามแฝง',
      profile_key: user.pen_key ?? '',
      avatar: null,
      department: null,
      position: null,
      is_pen_name: true,
    }
  }
  const avatarId = typeof user.avatar === 'object' && user.avatar ? user.avatar.id : (user.avatar ?? null)
  return {
    name: user.display_name?.trim() || user.name,
    profile_key: user.public_key ?? '',
    avatar: avatarId ? String(avatarId) : null,
    department: user.show_department ? (user.department ?? null) : null,
    position: user.show_department ? (user.position ?? null) : null,
    is_pen_name: false,
  }
}
