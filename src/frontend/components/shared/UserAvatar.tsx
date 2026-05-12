import { Avatar, type AvatarProps } from '@mantine/core'

interface UserAvatarProps extends Omit<AvatarProps, 'src' | 'children' | 'name'> {
  name?: string | null
  image?: string | null
  /** Fallback color when no image — defaults to 'blue' */
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

/**
 * Avatar yang prioritaskan Google photo (`image`), fallback ke inisial nama.
 * Dipakai di seluruh project untuk konsistensi.
 */
export function UserAvatar({ name, image, color = 'blue', ...props }: UserAvatarProps) {
  if (image) {
    return (
      <Avatar
        src={image}
        radius="xl"
        {...props}
      />
    )
  }

  return (
    <Avatar
      src={null}
      radius="xl"
      color={color}
      {...props}
    >
      {name ? initials(name) : '?'}
    </Avatar>
  )
}
