import { z } from 'zod'
import { env } from '../../../src/lib/env'
import { resolveSignupDecision, SIGNUP_ALLOWLIST_SETTING_KEY } from '../../../src/lib/signup-allowlist'
import { jsonText, type ToolModule } from './shared'

export const signupReadonly: ToolModule = {
  name: 'signup-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'signup_allowlist_check',
      {
        title: 'Signup allowlist check',
        description:
          'Would this email be allowed to create an account? Calls the same resolveSignupDecision() the Better Auth user.create.before hook calls, so it can never disagree with real behaviour. Reports allowed, reason (allowlist | super-admin | closed) and how many addresses are on the list. Readonly — never creates a user.',
        inputSchema: {
          email: z.string().describe('Candidate email address'),
        },
      },
      async ({ email }) => {
        const decision = await resolveSignupDecision(email)
        return jsonText({
          email,
          ...decision,
          settingKey: SIGNUP_ALLOWLIST_SETTING_KEY,
          // Counts only. The addresses themselves are readable through the
          // settings tools; this tool answers one question and nothing else.
          superAdminCarveOutCount: env.SUPER_ADMIN_EMAILS.length,
        })
      },
    )
  },
}
