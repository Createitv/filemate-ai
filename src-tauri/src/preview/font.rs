// Lightweight font metadata reader. Parses the OS/2 + name tables of TTF/OTF
// directly (a few hundred bytes from the file) so we don't need a full font
// library. Falls back to minimal info for WOFF / WOFF2 (compressed wrappers).

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

#[derive(Serialize, Default)]
pub struct FontMeta {
    pub family: Option<String>,
    pub subfamily: Option<String>,
    pub full_name: Option<String>,
    pub version: Option<String>,
    pub copyright: Option<String>,
    pub manufacturer: Option<String>,
    pub designer: Option<String>,
    pub format: String,
    pub num_glyphs: Option<u32>,
}

pub fn extract(path: &Path) -> AppResult<FontMeta> {
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let mut file = File::open(path)?;
    let mut header = [0u8; 12];
    file.read_exact(&mut header)?;

    let format = match &header[0..4] {
        [0x00, 0x01, 0x00, 0x00] | b"true" => "TTF",
        b"OTTO" => "OTF",
        b"wOFF" => "WOFF",
        b"wOF2" => "WOFF2",
        b"ttcf" => "TTC",
        _ => "Unknown",
    };

    let mut meta = FontMeta {
        format: format.to_string(),
        ..Default::default()
    };

    // Only TTF/OTF can be read with this minimal parser; WOFF wraps them in
    // a compressed container that requires a real codec.
    if format == "TTF" || format == "OTF" {
        if let Err(e) = read_name_table(&mut file, &mut meta) {
            tracing::warn!("font name table read failed: {e}");
        }
    }
    let _ = ext;
    Ok(meta)
}

fn u16_be(b: &[u8]) -> u16 {
    u16::from_be_bytes([b[0], b[1]])
}
fn u32_be(b: &[u8]) -> u32 {
    u32::from_be_bytes([b[0], b[1], b[2], b[3]])
}

fn read_name_table(file: &mut File, meta: &mut FontMeta) -> AppResult<()> {
    file.seek(SeekFrom::Start(0))?;
    let mut head = [0u8; 12];
    file.read_exact(&mut head)?;
    let num_tables = u16_be(&head[4..6]);

    let mut name_offset = 0u32;
    let mut name_length = 0u32;
    let mut maxp_offset = 0u32;
    for _ in 0..num_tables {
        let mut rec = [0u8; 16];
        file.read_exact(&mut rec)?;
        let tag = &rec[0..4];
        let offset = u32_be(&rec[8..12]);
        let length = u32_be(&rec[12..16]);
        if tag == b"name" {
            name_offset = offset;
            name_length = length;
        } else if tag == b"maxp" {
            maxp_offset = offset;
        }
    }
    if name_offset == 0 {
        return Err(AppError::Other("no name table".into()));
    }

    if maxp_offset > 0 {
        file.seek(SeekFrom::Start(maxp_offset as u64))?;
        let mut buf = [0u8; 6];
        if file.read_exact(&mut buf).is_ok() {
            meta.num_glyphs = Some(u16_be(&buf[4..6]) as u32);
        }
    }

    file.seek(SeekFrom::Start(name_offset as u64))?;
    let mut header = [0u8; 6];
    file.read_exact(&mut header)?;
    let count = u16_be(&header[2..4]) as usize;
    let storage_offset = u16_be(&header[4..6]) as u32;

    let mut records: Vec<(u16, u16, u16, u16, u16, u16)> = Vec::with_capacity(count);
    for _ in 0..count {
        let mut rec = [0u8; 12];
        file.read_exact(&mut rec)?;
        records.push((
            u16_be(&rec[0..2]),
            u16_be(&rec[2..4]),
            u16_be(&rec[4..6]),
            u16_be(&rec[6..8]),
            u16_be(&rec[8..10]),
            u16_be(&rec[10..12]),
        ));
    }

    let storage = name_offset + storage_offset;
    for (platform_id, encoding_id, _lang, name_id, length, offset) in records {
        // Prefer English Unicode (3,1) or Mac Roman (1,0)
        let is_pref = (platform_id == 3 && encoding_id == 1) || (platform_id == 1 && encoding_id == 0);
        if !is_pref {
            continue;
        }
        file.seek(SeekFrom::Start((storage + offset as u32) as u64))?;
        let mut buf = vec![0u8; length as usize];
        if file.read_exact(&mut buf).is_err() {
            continue;
        }
        let value = if platform_id == 3 {
            // UTF-16BE
            let chars: Vec<u16> = buf
                .chunks_exact(2)
                .map(|c| u16_be(c))
                .collect();
            String::from_utf16_lossy(&chars)
        } else {
            String::from_utf8_lossy(&buf).to_string()
        };
        let slot: Option<&mut Option<String>> = match name_id {
            0 => Some(&mut meta.copyright),
            1 => Some(&mut meta.family),
            2 => Some(&mut meta.subfamily),
            4 => Some(&mut meta.full_name),
            5 => Some(&mut meta.version),
            8 => Some(&mut meta.manufacturer),
            9 => Some(&mut meta.designer),
            _ => None,
        };
        if let Some(slot) = slot {
            if slot.is_none() {
                *slot = Some(value);
            }
        }
    }
    Ok(())
}
