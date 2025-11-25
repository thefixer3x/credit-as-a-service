#!/usr/bin/env python3
import re

def fix_trailing_commas(content):
    # Split into lines
    lines = content.split('\n')
    fixed_lines = []
    
    for i, line in enumerate(lines):
        # Check if line ends with comma
        if line.strip().endswith(','):
            # Look at the next non-empty line
            next_line_idx = i + 1
            while next_line_idx < len(lines) and lines[next_line_idx].strip() == '':
                next_line_idx += 1
            
            if next_line_idx < len(lines):
                next_line = lines[next_line_idx].strip()
                # If next line is a closing brace, remove the comma
                if next_line == '}':
                    # Remove the trailing comma
                    fixed_line = re.sub(r',$', '', line)
                    fixed_lines.append(fixed_line)
                else:
                    fixed_lines.append(line)
            else:
                fixed_lines.append(line)
        else:
            fixed_lines.append(line)
    
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


