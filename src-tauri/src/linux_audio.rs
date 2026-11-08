use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
    thread,
};
use tauri::Manager;
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};
use uuid::Uuid;

struct AudioServer {
    port: u16,
    files: Arc<Mutex<HashMap<String, PathBuf>>>,
}

static SERVER: OnceLock<Result<AudioServer, String>> = OnceLock::new();

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name, value).expect("valid audio response header")
}

fn headers() -> Vec<Header> {
    vec![
        header("Access-Control-Allow-Origin", "*"),
        header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS"),
        header("Access-Control-Allow-Headers", "Range"),
        header(
            "Access-Control-Expose-Headers",
            "Content-Length, Content-Range, Accept-Ranges",
        ),
        header("Accept-Ranges", "bytes"),
        header("Cache-Control", "no-store"),
        header("X-Content-Type-Options", "nosniff"),
    ]
}

fn reject(request: Request, status: u16, length: Option<u64>) {
    let mut response = Response::empty(StatusCode(status));
    for item in headers() {
        response.add_header(item);
    }
    if let Some(length) = length {
        response.add_header(header("Content-Range", &format!("bytes */{length}")));
    }
    let _ = request.respond(response);
}

fn byte_range(value: Option<&str>, length: u64) -> Result<(u64, u64, bool), ()> {
    let Some(value) = value else {
        return Ok((0, length, false));
    };
    let range = value.strip_prefix("bytes=").ok_or(())?;
    let (start, end) = range.split_once('-').ok_or(())?;
    if length == 0 {
        return Err(());
    }
    if start.is_empty() {
        let suffix: u64 = end.parse().map_err(|_| ())?;
        if suffix == 0 {
            return Err(());
        }
        let count = suffix.min(length);
        return Ok((length - count, count, true));
    }
    let start: u64 = start.parse().map_err(|_| ())?;
    let end = if end.is_empty() {
        length - 1
    } else {
        end.parse::<u64>().map_err(|_| ())?.min(length - 1)
    };
    if start >= length || end < start {
        return Err(());
    }
    Ok((start, end - start + 1, true))
}

fn content_type(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "ogg" | "opus" => "audio/ogg",
        "m4a" | "mp4" => "audio/mp4",
        "aac" => "audio/aac",
        _ => "application/octet-stream",
    }
}

fn respond(request: Request, path: PathBuf) {
    if request.method() == &Method::Options {
        reject(request, 204, None);
        return;
    }
    if request.method() != &Method::Get && request.method() != &Method::Head {
        reject(request, 405, None);
        return;
    }
    let Ok(mut file) = File::open(&path) else {
        reject(request, 404, None);
        return;
    };
    let Ok(metadata) = file.metadata() else {
        reject(request, 404, None);
        return;
    };
    if !metadata.is_file() {
        reject(request, 404, None);
        return;
    }
    let length = metadata.len();
    let range = request
        .headers()
        .iter()
        .find(|item| item.field.equiv("Range"))
        .map(|item| item.value.as_str());
    let Ok((start, count, partial)) = byte_range(range, length) else {
        reject(request, 416, Some(length));
        return;
    };
    if file.seek(SeekFrom::Start(start)).is_err() {
        reject(request, 500, None);
        return;
    }
    let Ok(count_usize) = usize::try_from(count) else {
        reject(request, 413, None);
        return;
    };
    let mut response_headers = headers();
    response_headers.push(header("Content-Type", content_type(&path)));
    if partial {
        response_headers.push(header(
            "Content-Range",
            &format!("bytes {start}-{}/{length}", start + count - 1),
        ));
    }
    let response = Response::new(
        StatusCode(if partial { 206 } else { 200 }),
        response_headers,
        file.take(count),
        Some(count_usize),
        None,
    )
    .with_chunked_threshold(usize::MAX);
    let _ = request.respond(response);
}

fn server() -> Result<&'static AudioServer, String> {
    SERVER
        .get_or_init(|| {
            let server =
                Arc::new(Server::http(("127.0.0.1", 0)).map_err(|error| error.to_string())?);
            let port = server
                .server_addr()
                .to_ip()
                .ok_or("No loopback address")?
                .port();
            let files = Arc::new(Mutex::new(HashMap::<String, PathBuf>::new()));
            for _ in 0..4 {
                let server = Arc::clone(&server);
                let files = Arc::clone(&files);
                thread::spawn(move || {
                    for request in server.incoming_requests() {
                        let path = files
                            .lock()
                            .ok()
                            .and_then(|files| files.get(request.url()).cloned());
                        match path {
                            Some(path) => respond(request, path),
                            None => reject(request, 404, None),
                        }
                    }
                });
            }
            Ok(AudioServer { port, files })
        })
        .as_ref()
        .map_err(Clone::clone)
}

#[tauri::command]
pub fn open_audio_stream(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let path = std::fs::canonicalize(path).map_err(|_| "Could not open the audio file.")?;
    if !app.asset_protocol_scope().is_allowed(&path) {
        return Err("Access to this file was not granted.".into());
    }
    if !path.is_file() {
        return Err("The audio path is not a file.".into());
    }
    let server = server()?;
    let token = format!("/{}", Uuid::new_v4().simple());
    let mut files = server
        .files
        .lock()
        .map_err(|_| "Audio server is unavailable.")?;
    if files.len() >= 32 {
        return Err("Too many pending audio streams.".into());
    }
    files.insert(token.clone(), path);
    Ok(format!("http://127.0.0.1:{}{token}", server.port))
}

#[tauri::command]
pub fn close_audio_stream(url: String) {
    if let Some(Ok(server)) = SERVER.get() {
        let prefix = format!("http://127.0.0.1:{}", server.port);
        if let Some(token) = url.strip_prefix(&prefix) {
            if let Ok(mut files) = server.files.lock() {
                files.remove(token);
            }
        }
    }
}

pub fn clear_streams() {
    if let Some(Ok(server)) = SERVER.get() {
        if let Ok(mut files) = server.files.lock() {
            files.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::byte_range;
    #[test]
    fn ranges_cover_seek_open_ended_and_suffix_requests() {
        assert_eq!(byte_range(None, 100), Ok((0, 100, false)));
        assert_eq!(byte_range(Some("bytes=10-19"), 100), Ok((10, 10, true)));
        assert_eq!(byte_range(Some("bytes=90-"), 100), Ok((90, 10, true)));
        assert_eq!(byte_range(Some("bytes=-20"), 100), Ok((80, 20, true)));
        assert_eq!(byte_range(Some("bytes=0-999"), 100), Ok((0, 100, true)));
        for value in [
            "bytes=100-",
            "bytes=20-10",
            "bytes=-0",
            "bytes=0-1,5-6",
            "items=0-1",
            "bytes=18446744073709551616-",
        ] {
            assert!(byte_range(Some(value), 100).is_err(), "{value}");
        }
        assert!(byte_range(Some("bytes=0-"), 0).is_err());
    }

    #[test]
    fn http_streams_only_registered_files_and_supports_ranges_and_head() {
        use std::io::{Read, Write};
        use std::net::TcpStream;
        let path = std::env::temp_dir().join(format!("kitto-range-{}", uuid::Uuid::new_v4()));
        std::fs::write(&path, b"0123456789").unwrap();
        let server = super::server().unwrap();
        let token = format!("/{}", uuid::Uuid::new_v4().simple());
        server
            .files
            .lock()
            .unwrap()
            .insert(token.clone(), path.clone());
        let send = |method: &str, target: &str, extra: &str| {
            let mut socket = TcpStream::connect(("127.0.0.1", server.port)).unwrap();
            socket
                .set_read_timeout(Some(std::time::Duration::from_secs(3)))
                .unwrap();
            write!(
                socket,
                "{method} {target} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n{extra}\r\n"
            )
            .unwrap();
            let mut response = String::new();
            socket.read_to_string(&mut response).unwrap();
            response
        };
        let range = send("GET", &token, "Range: bytes=2-5\r\n");
        assert!(range.starts_with("HTTP/1.1 206"));
        assert!(
            range
                .to_ascii_lowercase()
                .contains("content-range: bytes 2-5/10")
        );
        assert!(range.ends_with("2345"));
        let head = send("HEAD", &token, "");
        assert!(head.starts_with("HTTP/1.1 200"));
        assert!(head.to_ascii_lowercase().contains("content-length: 10"));
        assert!(head.ends_with("\r\n\r\n"));
        assert!(send("GET", &token, "Range: bytes=100-\r\n").starts_with("HTTP/1.1 416"));
        assert!(send("POST", &token, "Content-Length: 0\r\n").starts_with("HTTP/1.1 405"));
        assert!(send("GET", "/etc/passwd", "").starts_with("HTTP/1.1 404"));
        super::close_audio_stream(format!("http://127.0.0.1:{}{token}", server.port));
        assert!(send("GET", &token, "").starts_with("HTTP/1.1 404"));
        std::fs::remove_file(path).unwrap();
    }
}
