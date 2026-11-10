use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf, process::Command};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::consts::OS != "linux" || std::env::consts::ARCH != "x86_64" {
        return Err(
            "Committed bindings are generated on Linux x86_64;use the Ubuntu CI lane".into(),
        );
    }
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()?;
    let args: Vec<_> = std::env::args().skip(1).collect();
    if !args.is_empty() && args != ["--check"] {
        return Err("Usage: native-codegen [--check]".into());
    }
    let check = !args.is_empty();
    let temp = root
        .join("artifacts/native-codegen")
        .join(std::process::id().to_string());
    let csharp = temp.join("csharp");
    let ts = temp.join("ts");
    fs::create_dir_all(&csharp)?;
    fs::create_dir_all(&ts)?;
    let protoc = protoc_bin_vendored::protoc_bin_path()?;
    let generation = (|| -> Result<(), Box<dyn std::error::Error>> {
        let version = Command::new(&protoc).arg("--version").output()?;
        if !version.status.success() {
            return Err("Protoc unavailable".into());
        }
        let version = String::from_utf8(version.stdout)?.trim().to_owned();
        println!("{version}");
        for args in [
            vec![
                "--csharp_out=".to_owned() + csharp.to_str().unwrap(),
                "--csharp_opt=base_namespace=VirtualLife.Native.Public.V1".into(),
            ],
            vec![
                "--es_out=".to_owned() + ts.to_str().unwrap(),
                "--es_opt=target=ts".into(),
                "--plugin=protoc-gen-es=".to_owned()
                    + root
                        .join("node_modules/.bin/protoc-gen-es")
                        .to_str()
                        .unwrap(),
            ],
        ] {
            let status = Command::new(&protoc)
                .current_dir(root.join("proto/native"))
                .args(args)
                .arg("public.proto")
                .status()?;
            if !status.success() {
                return Err("Public contract generation failed".into());
            }
        }
        let mut generated = Vec::new();
        for (from, to) in [
            (
                csharp.join("Public.cs"),
                root.join("contracts/generated/csharp/Public.cs"),
            ),
            (
                ts.join("public_pb.ts"),
                root.join("packages/native-protocol/src/generated/public_pb.ts"),
            ),
        ] {
            let mut bytes = fs::read(from)?;
            // Canonical single trailing LF avoids generated EOF whitespace drift.
            while bytes.ends_with(b"\n\n") {
                bytes.pop();
            }
            generated.push(serde_json::json!({"ref":to.strip_prefix(&root)?.to_string_lossy().replace(std::path::MAIN_SEPARATOR,"/"),"sha256":format!("{:x}",Sha256::digest(&bytes))}));
            if check {
                if fs::read(to)? != bytes {
                    return Err("Generated contract drift".into());
                }
            } else {
                fs::create_dir_all(to.parent().unwrap())?;
                fs::write(to, bytes)?;
            }
        }
        let node: serde_json::Value =
            serde_json::from_slice(&fs::read(root.join("package.json"))?)?;
        let manifest = serde_json::json!({
            "schemaVersion":1,"publicProtocolVersion":1,"internalRpcVersion":1,
            "compilerCrate":"protoc-bin-vendored@3.3.0","compilerVersion":version,
            "generationHost":"linux-x86_64","compilerSha256":format!("{:x}",Sha256::digest(fs::read(&protoc)?)),
            "typescriptGenerator":node["devDependencies"]["@bufbuild/protoc-gen-es"],
            "publicProtoSha256":format!("{:x}",Sha256::digest(fs::read(root.join("proto/native/public.proto"))?)),
            "internalProtoSha256":format!("{:x}",Sha256::digest(fs::read(root.join("proto/native/internal.proto"))?)),
            "generated":generated,
            "csharpRuntimeCompilation":"NOT_RUN;requires target-compatible Google.Protobuf/runtime and Unity gate VL-081",
            "authentication":"Wire data only;VL-013 remains required"
        });
        let mut bytes = serde_json::to_vec_pretty(&manifest)?;
        bytes.push(b'\n');
        let output = root.join("contracts/generated/csharp/GENERATION.json");
        if check {
            if fs::read(output)? != bytes {
                return Err("Generation manifest drift".into());
            }
        } else {
            fs::write(output, bytes)?;
        }
        Ok(())
    })();
    fs::remove_dir_all(temp)?;
    generation
}
