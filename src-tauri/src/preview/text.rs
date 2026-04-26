use crate::error::AppResult;
use std::path::Path;

pub fn read(path: &Path) -> AppResult<String> {
    Ok(std::fs::read_to_string(path)?)
}
