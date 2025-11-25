#!/usr/bin/env python3
import re

def fix_trailing_commas(content):
    # Pattern to match lines ending with comma followed by a closing brace on the next line
    # This handles the specific case where a comma is followed by }, which is invalid JSON
    lines = content.split('\n')
    fixed_lines = []
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        # Check if current line ends with comma and next line is a closing brace
        if i + 1 < len(lines) and line.strip().endswith(',') and lines[i + 1].strip() == '}':
            # Remove the trailing comma
            fixed_line = re.sub(r',$', '', line)
            fixed_lines.append(fixed_line)
        else:
            fixed_lines.append(line)
        i += 1
    
    return '\n'.join(fixed_lines)

# Read the file
with open('bun.lock', 'r') as f:
    content = f.read()

# Fix trailing commas
fixed_content = fix_trailing_commas(content)

# Write back to file
with open('bun.lock', 'w') as f:
    f.write(fixed_content)

print("Fixed trailing commas in bun.lock")


