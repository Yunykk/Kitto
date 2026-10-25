// Hide release console.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    kitto_lib::run()
}
