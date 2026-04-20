"""
Hindi TTS generator using Python gTTS.
Reads text from stdin, writes MP3 to the path given as argv[1].

Usage:
  echo "नमस्ते" | python gtts_hindi.py output.mp3
"""
import sys
import os

def main():
    if len(sys.argv) < 2:
        print("Usage: python gtts_hindi.py <output_mp3_path>", file=sys.stderr)
        sys.exit(1)

    output_path = sys.argv[1]
    text = sys.stdin.read().strip()

    if not text:
        print("Error: No text received on stdin", file=sys.stderr)
        sys.exit(1)

    try:
        from gtts import gTTS
        tts = gTTS(text=text, lang='hi', slow=False)
        tts.save(output_path)
        print(f"OK:{output_path}", flush=True)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
