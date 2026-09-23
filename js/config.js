// Supabase connection config, published as RaumeStudy.config.
//
// Fill these in after creating your Supabase project -- see SUPABASE_SETUP.md.
// The anon/public key is meant to be embedded in client-side code like this;
// it is safe to commit because Row Level Security (supabase/schema.sql) is
// what actually protects the data, not secrecy of this key. Never put the
// "service_role" key here or anywhere else in this repo.
//
// allowSignups mirrors the project's Authentication › Sign In / Providers ›
// "Allow new users to sign up" switch: off, the app offers only Sign in (a
// Sign up link would only end in Supabase's "Signups not allowed" error).
// Turn both on together to let a new account be created.
//
// The `|| ` guard lets a deploy (or a test) pre-set RaumeStudy.config before
// this file loads to point at a different project without editing this file.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.config = window.RaumeStudy.config || {
  url: "https://mfxhyrsuslvuctgimloz.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1meGh5cnN1c2x2dWN0Z2ltbG96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MTY0MTgsImV4cCI6MjEwMzM5MjQxOH0.G3kNmFjm421MUi3G6uogon6HLMYVTRwHW081fLgt510",
  allowSignups: false,
};
