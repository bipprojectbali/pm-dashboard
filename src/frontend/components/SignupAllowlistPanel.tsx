import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { TbCheck, TbLock, TbMailPlus, TbTrash, TbUserPlus } from 'react-icons/tb'
import { apiFetch, saveSetting } from '@/frontend/components/aisettingspanel/constants'
import {
  type AddFailure,
  addEmail,
  parseAllowlist,
  removeEmail,
  sameAllowlist,
  serializeAllowlist,
} from '@/frontend/components/signupallowlist/helpers'
import { notifyError, notifySuccess } from '@/frontend/lib/notify'

type Settings = Record<string, string>

const SETTING_KEY = 'auth.signupAllowlist'

const ADD_FAILURE_MESSAGE: Record<AddFailure, string> = {
  empty: 'Isi alamat email dulu.',
  invalid: 'Format email tidak valid. Contoh: nama@perusahaan.com',
  duplicate: 'Alamat itu sudah ada di daftar.',
}

export function SignupAllowlistPanel() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'app-settings'],
    queryFn: () => apiFetch<{ settings: Settings }>('/api/admin/app-settings'),
    staleTime: 0,
  })
  const stored = data?.settings?.[SETTING_KEY]

  const [emails, setEmails] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)

  const storedEmails = useMemo(() => parseAllowlist(stored), [stored])

  useEffect(() => {
    if (!data) return
    setEmails(parseAllowlist(stored))
    setDraft('')
    setDraftError(null)
  }, [data, stored])

  const dirty = !sameAllowlist(emails, storedEmails)

  const save = useMutation({
    mutationFn: () => saveSetting(SETTING_KEY, serializeAllowlist(emails)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'app-settings'] })
      notifySuccess({
        title: 'Tersimpan',
        message: emails.length
          ? `${emails.length} alamat email diizinkan mendaftar.`
          : 'Daftar dikosongkan — pendaftaran kini tertutup.',
      })
    },
    onError: (e: Error) => notifyError({ title: 'Gagal menyimpan', message: e.message }),
  })

  const handleAdd = () => {
    const result = addEmail(emails, draft)
    if (!result.ok) {
      setDraftError(ADD_FAILURE_MESSAGE[result.reason])
      return
    }
    setEmails(result.emails)
    setDraft('')
    setDraftError(null)
  }

  const handleRemove = (email: string) => {
    setEmails((prev) => removeEmail(prev, email))
    setDraftError(null)
  }

  return (
    <Stack gap="lg">
      <div>
        <Title order={3}>Pendaftaran Akun Baru</Title>
        <Text c="dimmed" size="sm">
          Hanya alamat email di daftar ini yang boleh membuat akun baru — lewat email/password maupun Google.
        </Text>
      </div>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Group gap="xs" justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              <ThemeIcon variant="light" color={emails.length ? 'teal' : 'blue'} size="md" radius="md">
                {emails.length ? <TbUserPlus size={16} /> : <TbLock size={16} />}
              </ThemeIcon>
              <Stack gap={0}>
                <Text fw={500} size="sm">
                  Daftar Email yang Diizinkan
                </Text>
                <Text size="xs" c="dimmed">
                  Tambahkan alamat saat ada karyawan baru, hapus setelah akunnya dibuat.
                </Text>
              </Stack>
            </Group>
            <Badge size="lg" variant="light" color={emails.length ? 'teal' : 'blue'}>
              {emails.length ? `${emails.length} diizinkan` : 'Tertutup'}
            </Badge>
          </Group>

          <Divider />

          {emails.length === 0 && (
            <Alert color="blue" variant="light" icon={<TbLock size={16} />} title="Pendaftaran tertutup">
              Daftar kosong, jadi tidak ada orang baru yang bisa membuat akun. Ini kondisi aman dan memang bawaannya —
              bukan kesalahan. Tambahkan alamat email di bawah hanya saat ada orang yang memang perlu akun.
            </Alert>
          )}

          <Group align="flex-start" gap="xs" wrap="nowrap">
            <TextInput
              style={{ flex: 1 }}
              label="Tambah alamat email"
              placeholder="nama@perusahaan.com"
              value={draft}
              error={draftError}
              onChange={(e) => {
                setDraft(e.currentTarget.value)
                setDraftError(null)
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                handleAdd()
              }}
            />
            <Button
              mt={25}
              variant="light"
              leftSection={<TbMailPlus size={14} />}
              onClick={handleAdd}
              disabled={isLoading}
            >
              Tambah
            </Button>
          </Group>

          {emails.length > 0 && (
            <Stack gap={6}>
              {emails.map((email) => (
                <Group
                  key={email.toLowerCase()}
                  justify="space-between"
                  wrap="nowrap"
                  px="sm"
                  py={6}
                  style={{
                    border: '1px solid var(--mantine-color-default-border)',
                    borderRadius: 'var(--mantine-radius-sm)',
                  }}
                >
                  <Text size="sm" style={{ wordBreak: 'break-all' }}>
                    {email}
                  </Text>
                  <Tooltip label="Hapus dari daftar" withArrow>
                    <ActionIcon variant="subtle" color="red" onClick={() => handleRemove(email)}>
                      <TbTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              ))}
            </Stack>
          )}

          <Group justify="space-between">
            <Text size="xs" c={dirty ? 'orange' : 'dimmed'}>
              {dirty ? 'Ada perubahan yang belum disimpan.' : 'Tersimpan — sama dengan yang berlaku di server.'}
            </Text>
            <Button
              leftSection={<TbCheck size={14} />}
              onClick={() => save.mutate()}
              loading={save.isPending || isLoading}
              disabled={!dirty}
            >
              Simpan
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder padding="md" radius="md">
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Yang perlu diketahui:
          </Text>
          <Text size="xs" c="dimmed">
            1. Perubahan baru berlaku setelah tombol Simpan ditekan.
          </Text>
          <Text size="xs" c="dimmed">
            2. Pencocokan alamat tidak membedakan huruf besar/kecil.
          </Text>
          <Text size="xs" c="dimmed">
            3. Daftar ini hanya mengatur pembuatan akun baru. Akun yang sudah ada tetap bisa masuk walau alamatnya
            dihapus dari sini.
          </Text>
          <Text size="xs" c="dimmed">
            4. Alamat super admin yang diatur lewat environment server selalu boleh mendaftar, terlepas dari daftar ini.
          </Text>
        </Stack>
      </Card>
    </Stack>
  )
}
