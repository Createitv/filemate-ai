// AES-256-GCM file encryption with Argon2id key derivation.
// Format (.nxenc):
//   bytes 0..6   : magic "NXENC1"
//   byte  6      : version = 1
//   bytes 7..23  : 16-byte salt
//   bytes 23..35 : 12-byte nonce
//   bytes 35..   : ciphertext (with 16-byte GCM tag at end)

use crate::error::{AppError, AppResult};
use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Key, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use rand::RngCore;
use std::path::Path;

const MAGIC: &[u8; 6] = b"NXENC1";
const VERSION: u8 = 1;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const HEADER_LEN: usize = 6 + 1 + SALT_LEN + NONCE_LEN;

fn derive_key(password: &[u8], salt: &[u8]) -> AppResult<[u8; 32]> {
    let mut key = [0u8; 32];
    let params = Params::new(64 * 1024, 3, 1, Some(32))
        .map_err(|e| AppError::Other(e.to_string()))?;
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(password, salt, &mut key)
        .map_err(|e| AppError::Other(e.to_string()))?;
    Ok(key)
}

#[tauri::command]
pub async fn encrypt_file(input: String, output: String, password: String) -> AppResult<()> {
    let plaintext = std::fs::read(&input)?;
    let mut salt = [0u8; SALT_LEN];
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let key = derive_key(password.as_bytes(), &salt)?;
    let cipher =
        Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let nonce = Nonce::from_slice(&nonce_bytes);
    let aad = Path::new(&input)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let ciphertext = cipher
        .encrypt(
            nonce,
            Payload {
                msg: &plaintext,
                aad: aad.as_bytes(),
            },
        )
        .map_err(|e| AppError::Other(e.to_string()))?;
    let mut out = Vec::with_capacity(HEADER_LEN + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.push(VERSION);
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    std::fs::write(&output, out)?;
    Ok(())
}

#[tauri::command]
pub async fn decrypt_file(input: String, output: String, password: String) -> AppResult<()> {
    let blob = std::fs::read(&input)?;
    if blob.len() < HEADER_LEN || &blob[0..6] != MAGIC {
        return Err(AppError::Other("not a NexFile encrypted file".into()));
    }
    if blob[6] != VERSION {
        return Err(AppError::Other("unsupported version".into()));
    }
    let salt = &blob[7..7 + SALT_LEN];
    let nonce = &blob[7 + SALT_LEN..7 + SALT_LEN + NONCE_LEN];
    let ciphertext = &blob[HEADER_LEN..];
    let key = derive_key(password.as_bytes(), salt)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let aad = Path::new(&input)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let plaintext = cipher
        .decrypt(
            Nonce::from_slice(nonce),
            Payload {
                msg: ciphertext,
                aad: aad.as_bytes(),
            },
        )
        .map_err(|_| AppError::Other("decryption failed (wrong password or corrupted file)".into()))?;
    std::fs::write(&output, plaintext)?;
    Ok(())
}

#[tauri::command]
pub async fn encrypt_text(text: String, password: String) -> AppResult<String> {
    let mut salt = [0u8; SALT_LEN];
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let key = derive_key(password.as_bytes(), &salt)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), text.as_bytes())
        .map_err(|e| AppError::Other(e.to_string()))?;
    let mut buf = Vec::new();
    buf.extend_from_slice(&salt);
    buf.extend_from_slice(&nonce_bytes);
    buf.extend_from_slice(&ct);
    Ok(base64::engine::general_purpose::STANDARD.encode(buf))
}

#[tauri::command]
pub async fn decrypt_text(blob_b64: String, password: String) -> AppResult<String> {
    use base64::Engine;
    let blob = base64::engine::general_purpose::STANDARD
        .decode(blob_b64)
        .map_err(|e| AppError::Other(e.to_string()))?;
    if blob.len() < SALT_LEN + NONCE_LEN {
        return Err(AppError::Other("invalid blob".into()));
    }
    let (salt, rest) = blob.split_at(SALT_LEN);
    let (nonce, ct) = rest.split_at(NONCE_LEN);
    let key = derive_key(password.as_bytes(), salt)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let pt = cipher
        .decrypt(Nonce::from_slice(nonce), ct)
        .map_err(|_| AppError::Other("decryption failed".into()))?;
    Ok(String::from_utf8(pt).map_err(|e| AppError::Other(e.to_string()))?)
}

// We use base64 directly via the `Engine` trait import.
use base64::Engine as _;
