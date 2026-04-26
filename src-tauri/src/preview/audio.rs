// Audio metadata via lofty: covers MP3 / FLAC / WAV / AAC / M4A / OGG / Opus.
// Returns ID3-style tags + duration + sample-rate so the frontend can render
// a header like "320 kbps · 44.1 kHz · 03:42".

use crate::error::AppResult;
use lofty::file::{TaggedFile, TaggedFileExt};
use lofty::prelude::{Accessor, AudioFile, ItemKey};
use lofty::probe::Probe;
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
pub struct AudioMeta {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub year: Option<u32>,
    pub track: Option<u32>,
    pub genre: Option<String>,
    pub duration_ms: u64,
    pub bitrate: Option<u32>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u8>,
    pub format: String,
}

pub fn extract(path: &Path) -> AppResult<AudioMeta> {
    let tagged: TaggedFile = Probe::open(path)
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?
        .read()
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?;

    let props = tagged.properties();
    let duration = props.duration();
    let bitrate = props.audio_bitrate();
    let sample_rate = props.sample_rate();
    let channels = props.channels();

    let primary = tagged.primary_tag().or_else(|| tagged.first_tag());

    let mut title = None;
    let mut artist = None;
    let mut album = None;
    let mut album_artist = None;
    let mut year = None;
    let mut track = None;
    let mut genre = None;

    if let Some(tag) = primary {
        title = tag.title().map(|s| s.into_owned());
        artist = tag.artist().map(|s| s.into_owned());
        album = tag.album().map(|s| s.into_owned());
        year = tag.year();
        track = tag.track();
        genre = tag.genre().map(|s| s.into_owned());
        album_artist = tag
            .get_string(&ItemKey::AlbumArtist)
            .map(|s| s.to_string());
    }

    Ok(AudioMeta {
        title,
        artist,
        album,
        album_artist,
        year,
        track,
        genre,
        duration_ms: duration.as_millis() as u64,
        bitrate,
        sample_rate,
        channels,
        format: format!("{:?}", tagged.file_type()),
    })
}
