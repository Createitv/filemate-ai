// Map a file extension to the language identifier expected by highlight.js /
// shiki on the frontend. Centralized here so the frontend stays simple.

pub fn language_for(ext: String) -> String {
    match ext.as_str() {
        "rs" => "rust",
        "go" => "go",
        "py" => "python",
        "js" | "mjs" | "cjs" => "javascript",
        "jsx" => "jsx",
        "ts" => "typescript",
        "tsx" => "tsx",
        "java" => "java",
        "kt" | "kts" => "kotlin",
        "swift" => "swift",
        "rb" => "ruby",
        "php" => "php",
        "c" | "h" => "c",
        "cc" | "cpp" | "hpp" | "hh" | "cxx" => "cpp",
        "css" => "css",
        "scss" => "scss",
        "less" => "less",
        "html" | "htm" => "html",
        "vue" => "vue",
        "svelte" => "svelte",
        "json" => "json",
        "xml" => "xml",
        "yaml" | "yml" => "yaml",
        "toml" => "toml",
        "sh" | "bash" | "zsh" => "bash",
        "lua" => "lua",
        "sql" => "sql",
        "md" | "mdx" => "markdown",
        "dockerfile" => "dockerfile",
        _ => "plaintext",
    }
    .to_string()
}
