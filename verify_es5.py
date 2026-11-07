import re

with open('dist/app.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Check for forbidden ES6+ constructs
forbidden = {
    'const ': r'\bconst\s+[a-zA-Z0-9_]+',
    'let ': r'\blet\s+[a-zA-Z0-9_]+',
    'arrow function': r'(=>|\([a-zA-Z0-9_,\s]*\)\s*=>)',
    'class keyword': r'\bclass\s+[a-zA-Z0-9_]+',
    'optional chaining': r'\?\.',
    'nullish coalescing': r'\?\?',
    'async function': r'\basync\s+function|\basync\s*\(',
    'await keyword': r'\bawait\s+',
    'template literal': r'`[^`]*`'
}

print(f"Total lines in dist/app.js: {len(code.splitlines())}")

has_error = False
for name, pattern in forbidden.items():
    matches = list(re.finditer(pattern, code))
    if matches:
        print(f"FAILED: Found {len(matches)} occurrences of {name}:")
        for m in matches[:5]:
            start = max(0, m.start() - 30)
            end = min(len(code), m.end() + 30)
            print(f"  Line snippet: {repr(code[start:end])}")
        has_error = True
    else:
        print(f"PASSED: No {name} found.")

if not has_error:
    print("\nSUCCESS: dist/app.js is 100% STRICT ES5!")
