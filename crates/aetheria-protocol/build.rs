fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../proto/native");
    let mut config = prost_build::Config::new();
    config.protoc_executable(protoc_bin_vendored::protoc_bin_path()?);
    tonic_prost_build::configure().compile_with_config(
        config,
        &[root.join("public.proto"), root.join("internal.proto")],
        std::slice::from_ref(&root),
    )?;
    println!("cargo:rerun-if-changed={}", root.display());
    Ok(())
}
