fn main() {
    match aetheria_pet_arena::wave1_mvp::rules_hash_hex() {
        Ok(hash) => println!("{hash}"),
        Err(error) => {
            eprintln!("wave1 rules hash failed: {error:?}");
            std::process::exit(1);
        }
    }
}
