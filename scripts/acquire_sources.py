#!/usr/bin/env python3
"""Acquire only pinned official sources, refusing to overwrite different bytes."""
import hashlib
from pathlib import Path
import urllib.request
import zipfile
from import_catalog import ROOT, PINS, ARCHIVE_URL
ARCHIVE_SHA256='0f2b24ffb556a4c532257775c1c32f86b67a00b79e738699d598474f304bc307'
def digest(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()
def main():
    sources=ROOT/'sources';sources.mkdir(exist_ok=True)
    if all((sources/n).is_file() and digest(sources/n)==s for n,s in PINS.items()):
        print('Pinned original members already present; no network or overwrite.');return
    archive=sources/'BAG_xls_2026.zip'
    if not archive.exists():
        staging=sources/'BAG_xls_2026.zip.part'
        if staging.exists():raise SystemExit('Existing partial archive; inspect before retry.')
        with urllib.request.urlopen(ARCHIVE_URL,timeout=120) as response, staging.open('xb') as dst:
            while chunk:=response.read(1024*1024):dst.write(chunk)
        if digest(staging)!=ARCHIVE_SHA256:raise SystemExit('Archive checksum mismatch; partial retained.')
        staging.rename(archive)
    if digest(archive)!=ARCHIVE_SHA256:raise SystemExit('Existing archive differs; nothing overwritten.')
    with zipfile.ZipFile(archive) as z:
        for name,expected in PINS.items():
            target=sources/name
            if target.exists():
                if digest(target)!=expected:raise SystemExit('Existing original differs: '+name)
                continue
            data=z.read('BAG_xls_2026/'+name)
            if hashlib.sha256(data).hexdigest()!=expected:raise SystemExit('Member mismatch: '+name)
            with target.open('xb') as f:f.write(data)
    print('Verified original members ready. Run python3 scripts/import_catalog.py.')
if __name__=='__main__':main()
