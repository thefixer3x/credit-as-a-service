#!/usr/bin/env python3
import re

def fix_trailing_commas(content):
    lines = content.split('\n')
    fixed_lines = []
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        # Check if current line ends with comma
        if line.strip().endswith(','):
            # Look ahead to see if the next non-empty line is a closing brace
            j = i + 1
            while j < len(lines) and lines[j].strip() == '':
                j += 1
            
            if j < len(lines) and lines[j].strip() == '}':
                # Remove the trailing comma
                fixed_line = re.sub(r',$', '', line)
                fixed_lines.append(fixed_line)
            else:
                fixed_lines.append(line)
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

print("Fixed all trailing commas in bun.lock")


