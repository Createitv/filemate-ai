// Image metadata: dimensions, color mode, EXIF, plus a 256-bucket RGB
// histogram computed from a downsampled thumbnail (so even 50 MP photos
// compute in ~50 ms).

use crate::error::{AppError, AppResult};
use exif::{In, Tag};
use image::GenericImageView;
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
pub struct ImageMeta {
    pub width: u32,
    pub height: u32,
    pub color: String,
    pub exif: Vec<ExifEntry>,
    pub histogram: Histogram,
}

#[derive(Serialize)]
pub struct ExifEntry {
    pub tag: String,
    pub group: String,
    pub value: String,
}

#[derive(Serialize)]
pub struct Histogram {
    pub r: Vec<u32>,
    pub g: Vec<u32>,
    pub b: Vec<u32>,
    pub luminance: Vec<u32>,
}

pub fn extract(path: &Path) -> AppResult<ImageMeta> {
    let img = image::ImageReader::open(path)
        .map_err(|e| AppError::Other(e.to_string()))?
        .with_guessed_format()
        .map_err(|e| AppError::Other(e.to_string()))?
        .decode()
        .map_err(|e| AppError::Other(e.to_string()))?;
    let (width, height) = img.dimensions();
    let color = format!("{:?}", img.color());
    let histogram = compute_histogram(&img);
    let exif = read_exif(path).unwrap_or_default();
    Ok(ImageMeta {
        width,
        height,
        color,
        exif,
        histogram,
    })
}

fn compute_histogram(img: &image::DynamicImage) -> Histogram {
    let target = 512u32;
    let (w, h) = img.dimensions();
    let scale = (w.max(h) as f32 / target as f32).max(1.0);
    let nw = (w as f32 / scale) as u32;
    let nh = (h as f32 / scale) as u32;
    let small = if scale > 1.0 {
        img.thumbnail(nw, nh).to_rgb8()
    } else {
        img.to_rgb8()
    };
    let mut r = vec![0u32; 256];
    let mut g = vec![0u32; 256];
    let mut b = vec![0u32; 256];
    let mut lum = vec![0u32; 256];
    for px in small.pixels() {
        let [pr, pg, pb] = px.0;
        r[pr as usize] += 1;
        g[pg as usize] += 1;
        b[pb as usize] += 1;
        // BT.601 luma
        let l = (0.299 * pr as f32 + 0.587 * pg as f32 + 0.114 * pb as f32) as usize;
        lum[l.min(255)] += 1;
    }
    Histogram {
        r,
        g,
        b,
        luminance: lum,
    }
}

fn read_exif(path: &Path) -> AppResult<Vec<ExifEntry>> {
    let file = std::fs::File::open(path)?;
    let mut reader = std::io::BufReader::new(file);
    let exifreader = exif::Reader::new();
    let exif = exifreader
        .read_from_container(&mut reader)
        .map_err(|e| AppError::Other(e.to_string()))?;
    let interesting = [
        Tag::Make,
        Tag::Model,
        Tag::LensModel,
        Tag::DateTimeOriginal,
        Tag::DateTime,
        Tag::ExposureTime,
        Tag::FNumber,
        Tag::ISOSpeed,
        Tag::FocalLength,
        Tag::FocalLengthIn35mmFilm,
        Tag::Flash,
        Tag::WhiteBalance,
        Tag::ExposureBiasValue,
        Tag::PixelXDimension,
        Tag::PixelYDimension,
        Tag::Orientation,
        Tag::ColorSpace,
        Tag::Software,
        Tag::Artist,
        Tag::Copyright,
        Tag::GPSLatitude,
        Tag::GPSLongitude,
        Tag::GPSAltitude,
    ];
    let mut out = Vec::new();
    for tag in interesting {
        for ifd in [In::PRIMARY, In::THUMBNAIL] {
            if let Some(field) = exif.get_field(tag, ifd) {
                out.push(ExifEntry {
                    tag: format!("{tag}"),
                    group: format!("{ifd:?}"),
                    value: field.display_value().with_unit(&exif).to_string(),
                });
                break;
            }
        }
    }
    Ok(out)
}
