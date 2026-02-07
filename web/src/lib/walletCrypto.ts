// Wallet encryption utilities using Web Crypto API
// Scheme: PBKDF2-SHA256 (600k iterations) + AES-256-GCM

const RECOVERY_PREFIX = 'claw_v1$'
const PBKDF2_ITERATIONS = 600_000
const SALT_LENGTH = 16
const IV_LENGTH = 12

/**
 * Derives an AES-256 key from a password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypts a private key with a password
 * Returns: claw_v1$ + base64(salt[16] + iv[12] + ciphertext + authTag)
 */
export async function encryptPrivateKey(privateKey: string, password: string): Promise<string> {
  const encoder = new TextEncoder()

  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  // Derive key from password
  const key = await deriveKey(password, salt)

  // Encrypt the private key
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(privateKey)
  )

  // Combine salt + iv + ciphertext into single buffer
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length)

  // Base64 encode and add prefix
  const base64 = btoa(String.fromCharCode(...combined))
  return RECOVERY_PREFIX + base64
}

/**
 * Decrypts a recovery code with password to get private key
 * Throws on wrong password or invalid format
 */
export async function decryptPrivateKey(recoveryCode: string, password: string): Promise<string> {
  // Validate and strip prefix
  if (!recoveryCode.startsWith(RECOVERY_PREFIX)) {
    throw new Error('Invalid recovery code format')
  }

  const base64 = recoveryCode.slice(RECOVERY_PREFIX.length)

  // Decode base64
  let combined: Uint8Array
  try {
    const binary = atob(base64)
    combined = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i)
    }
  } catch {
    throw new Error('Invalid recovery code format')
  }

  // Validate minimum length (salt + iv + at least 1 byte of ciphertext)
  if (combined.length < SALT_LENGTH + IV_LENGTH + 1) {
    throw new Error('Invalid recovery code format')
  }

  // Extract salt, iv, and ciphertext
  const salt = combined.slice(0, SALT_LENGTH)
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH)

  // Derive key from password
  const key = await deriveKey(password, salt)

  // Decrypt
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    )

    const decoder = new TextDecoder()
    return decoder.decode(decrypted)
  } catch {
    throw new Error('Wrong password or corrupted recovery code')
  }
}

/**
 * Validates that a string is a properly formatted recovery code
 */
export function isValidRecoveryCode(code: string): boolean {
  if (!code.startsWith(RECOVERY_PREFIX)) {
    return false
  }

  const base64 = code.slice(RECOVERY_PREFIX.length)

  try {
    const binary = atob(base64)
    // Must have at least salt + iv + some ciphertext
    return binary.length >= SALT_LENGTH + IV_LENGTH + 1
  } catch {
    return false
  }
}
