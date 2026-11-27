// Adresse et clé publique de la base Supabase (la clé publique peut être visible :
// les données sont protégées par les règles de sécurité de la base).
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
export const SUPABASE_URL = LOCAL ? location.origin : 'https://qjspgpiyefrrfiavrrzu.supabase.co';
export const SUPABASE_KEY = LOCAL
  ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6ImxvY2FsIiwiaWF0IjoxNzk1ODEzNDgxfQ.9sQqNad2QLc1NJkzydBXhqVGGd9EZZStDTAuMxPeFSs'
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqc3BncGl5ZWZycmZpYXZycnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU4MDU3NjcsImV4cCI6MjExMTM4MTc2N30.vH0Rr1CIPvEb6KjPLvi9WA6n8KIsYBrQnhWNpWLa6yM';
export const VERSION = '1.0.0';
