# Security Policy

## Demo-only software

**RBAC Matrix** is an educational portfolio demonstration. It:

- Uses **synthetic** roles and demo users only
- Does **not** authenticate real principals
- Does **not** enforce authorization against live systems
- Stores policy state in the browser session only (client-side React state)

Do not deploy this project as an identity or access-management control plane. Do not point it at production APIs, directories, or secrets.

## Reporting issues

If you find a documentation error or unsafe default in the demo narrative, open an issue in the portfolio repository or contact the author.

There is no bug-bounty program for this demo.

## Supported versions

Only the latest published demo snapshot is maintained for portfolio purposes.
