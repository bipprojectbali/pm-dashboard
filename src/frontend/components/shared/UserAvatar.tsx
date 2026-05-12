import { Avatar, type AvatarProps } from '@mantine/core'
import { useState } from 'react'

interface UserAvatarProps extends Omit<AvatarProps, 'src' | 'children' | 'name'> {
  name?: string | null
  image?: string | null
  color?: string
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export function UserAvatar({ name, image, color = 'blue', size = 'sm', style, ...props }: UserAvatarProps) {
  const [failed, setFailed] = useState(false)

  // Resolve size to px for the img element
  const sizePx =
    typeof size === 'number'
      ? size
      : size === 'xs' ? 16
      : size === 'sm' ? 26
      : size === 'md' ? 38
      : size === 'lg' ? 52
      : size === 'xl' ? 80
      : typeof size === 'string' && /^\d+$/.test(size) ? Number(size)
      : 26

  if (image && !failed) {
    return (
      <Avatar
        radius="xl"
        size={size}
        style={style}
        {...props}
      >
        {/* img inside Avatar slot — bypasses Mantine's src handling, allows referrerPolicy */}
        <img
          src={image}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          style={{ width: sizePx, height: sizePx, objectFit: 'cover', borderRadius: '50%' }}
          alt={name ?? ''}
        />
      </Avatar>
    )
  }

  return (
    <Avatar src={null} radius="xl" size={size} color={color} style={style} {...props}>
      {name ? initials(name) : '?'}
    </Avatar>
  )
}
