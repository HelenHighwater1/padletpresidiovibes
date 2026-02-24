#!/bin/bash
# Generate config.js from environment variables
cat > config.js << EOF
window.SUPABASE_URL = '${SUPABASE_URL}';
window.SUPABASE_ANON_KEY = '${SUPABASE_ANON_KEY}';
EOF
