

## Fix Positioning Language — Remove "Investor" References

The platform is positioned as **municipal enforcement intelligence**, not a leads/investor tool. The current landing page has 5 locations using "investor(s)" that contradict this positioning.

### Changes to `src/pages/Landing.tsx`

| Location | Current Copy | Replacement |
|----------|-------------|-------------|
| Hero subtext (line 255) | "Join 400+ early-access **investors** already tracking..." | "Join 400+ early-access **operators** already tracking..." |
| FOMO badge (line 290) | "First 200 **Investors**" | "First 200 **Users**" |
| Trust line (line 300) | "Trusted by 400+ **investors** during pilot" | "Trusted by 400+ **professionals** during pilot" |
| Testimonial role (line 965) | "Fix & Flip **Investor**, Dallas-Fort Worth" | "Fix & Flip Operator, Dallas-Fort Worth" |
| Footer tagline (line 1138) | "Enforcement intelligence for real estate **investors**" | "Enforcement intelligence for real estate professionals" |

### Rationale
- "Operators" and "professionals" are neutral terms that fit enforcement intelligence positioning
- Testimonial roles shift to "operator" to stay consistent
- No structural or layout changes — copy-only swap

