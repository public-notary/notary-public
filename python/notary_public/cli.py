"""
CLI entry point for notary-public.
Usage:
  notary verify   <receipt.json>
  notary sign     <receipt.json> [--key key.pem]
  notary list     [--osi] [--deprecated]
  notary search   <query>
  notary place    <SPDX-ID> [dest] [--force]
  notary notarize <file> [--spdx-id ID] [--key key.pem]
  notary version
"""
import argparse
import json
import sys
from pathlib import Path


def cmd_verify(args):
    from .verify import verify_receipt
    receipt = json.loads(Path(args.receipt).read_text("utf-8"))
    ok = verify_receipt(receipt)
    print("valid" if ok else "INVALID")
    sys.exit(0 if ok else 1)


def cmd_sign(args):
    from .sign import sign_receipt, load_issuer_key
    receipt = json.loads(Path(args.receipt).read_text("utf-8"))
    key_pem = load_issuer_key(args.key)
    signed = sign_receipt(receipt, key_pem)
    print(json.dumps(signed, indent=2))


def cmd_list(args):
    from .catalogue import list_licenses
    licenses = list_licenses(osi_only=args.osi, include_deprecated=args.deprecated)
    for l in licenses:
        flags = " [OSI]" if l["osi"] else ""
        flags += " [deprecated]" if l["deprecated"] else ""
        print(f"{l['id']:<40} {l['name']}{flags}")


def cmd_search(args):
    from .catalogue import search
    for l in search(args.query):
        print(f"{l['id']:<40} {l['name']}")


def cmd_place(args):
    from .place import place_license
    result = place_license(args.spdx_id, args.dest or None, force=args.force)
    print(f"Placed {result['id']} → {result['dest']} ({result['bytes']} bytes, sha256={result['sha256'][:12]}…)")


def cmd_notarize(args):
    from .notarize import notarize, verify_attestation
    from .sign import load_issuer_key
    key_pem = load_issuer_key(args.key) if args.key else None
    att = notarize(args.file, spdx_id=args.spdx_id or None, private_key_pem=key_pem)
    print(json.dumps(att, indent=2))
    if att.get("signature"):
        ok = verify_attestation(att)
        print(f"\nSignature: {'valid' if ok else 'INVALID'}")


def cmd_version(args):
    from .catalogue import version
    print(version() or "unknown")


def main():
    p = argparse.ArgumentParser(prog="notary", description="notary-public CLI")
    sub = p.add_subparsers(dest="cmd", required=True)

    v = sub.add_parser("verify", help="Verify a signed receipt")
    v.add_argument("receipt")

    s = sub.add_parser("sign", help="Sign a receipt (server-side)")
    s.add_argument("receipt")
    s.add_argument("--key", default=None)

    ls = sub.add_parser("list", help="List SPDX licenses")
    ls.add_argument("--osi", action="store_true")
    ls.add_argument("--deprecated", action="store_true")

    srch = sub.add_parser("search", help="Search SPDX licenses")
    srch.add_argument("query")

    pl = sub.add_parser("place", help="Place a license into a project")
    pl.add_argument("spdx_id")
    pl.add_argument("dest", nargs="?", default=None)
    pl.add_argument("--force", action="store_true")

    nz = sub.add_parser("notarize", help="Notarize a license file")
    nz.add_argument("file")
    nz.add_argument("--spdx-id", default=None)
    nz.add_argument("--key", default=None)

    sub.add_parser("version", help="Print SPDX list version")

    args = p.parse_args()
    dispatch = {
        "verify": cmd_verify,
        "sign": cmd_sign,
        "list": cmd_list,
        "search": cmd_search,
        "place": cmd_place,
        "notarize": cmd_notarize,
        "version": cmd_version,
    }
    dispatch[args.cmd](args)


if __name__ == "__main__":
    main()
