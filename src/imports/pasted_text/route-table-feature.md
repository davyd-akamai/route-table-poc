Build a mid-fidelity interactive prototype for a Route Tables feature
inside a cloud infrastructure management console. Connect to the
provided Supabase database for live data. Use components from the
connected design system library and apply existing text styles and
color variables throughout.

---

DESIGN SYSTEM REFERENCE

- Font: Untitled Sans for UI, Söhne Mono for IPs, CIDRs, and
  technical IDs
- Colors (Radix scale): slate for neutrals, blue for primary actions
  and links, green for active/valid states, red for destructive and
  error states, amber for warnings
- Spacing: 5px base unit (5, 10, 15, 20, 25, 35px)
- Border radius: 4px small, 6px inputs/cards, 8px panels
- Typography: 12px meta/labels, 13px table content, 15px default UI,
  17px section headings
- Style: clean white panels, low-contrast borders, minimal shadows,
  information-dense, no decorative gradients or illustrations

---

CONTEXT

Each VPC has exactly one Route Table that controls how network traffic
is directed within the VPC. Routes have several types:

- Static routes (interface_id, gateway_id) — user-created, point
  traffic to a specific Linode interface or gateway
- Blackhole routes — user-created, silently drop all traffic to
  the destination
- Platform routes — system-generated, read-only, manage the VPC's
  default egress and internal routing
- BGP routes — dynamically learned via BGP, read-only

ECMP (Equal-Cost Multi-Path) is achieved by creating multiple route
entries sharing the same destination, each with its own single nexthop.

Route limits per VPC:
- Blackhole routes: maximum 25
- Interface / Gateway routes: maximum 10 per Linode interface

---

PAGE STRUCTURE

Single page: VPC detail page with the Route Table tab active.

Top to bottom:
1. Page header
2. Summary block
3. Tab bar
4. Route Limits stats card
5. Toolbar (search, filter, toggle, add button)
6. Route table
7. Table footer

---

PAGE HEADER

- Title: "vpc-prod-us-east"
- Sub-row: region label "us-east (Newark)" · green "Active"
  status badge · secondary label "VPC · 10.0.0.0/16"
- No CTA buttons in the header

---

SUMMARY BLOCK

A white panel with light border, full width, placed between the page
header and the tab bar.

Top row: bold label "Summary" on the left. "Edit" and "Delete" text
links (blue, no button container) on the far right.

Two rows of metadata, each with three key-value pairs displayed
horizontally with generous spacing between them. Keys in bold,
values in regular weight, same font size.

Row 1:
- Subnets    2
- Region     DE, Frankfurt 2
- Created    2026-04-10T11:18:45

Row 2:
- Resources  3
- VPC ID     448158
- Updated    2026-04-10T11:18:45

---

TAB BAR

Two tabs only: Subnets · Route Table
"Route Table" is the active tab, visually underlined or highlighted.

---

ROUTE LIMITS CARD

A single white card placed below the tab bar, above the toolbar.
Contains three counters in one horizontal row:

Counter 1 — "Blackhole Routes"
- Live count: SELECT COUNT(*) FROM routes
  WHERE nexthop_type = 'blackhole' AND is_editable = true
- Limit label: "[n] of 25"
- Small progress bar below the count, blue fill on slate track

Counter 2 — "System Routes"
- Live count: SELECT COUNT(*) FROM routes
  WHERE is_editable = false
- No limit, no progress bar
- Muted helper text: "Platform-managed"

Counter 3 — "Interface / Gateway Routes"
- Live count: SELECT COUNT(*) FROM routes
  WHERE nexthop_type IN ('interface_id', 'gateway_id')
  AND is_editable = true
- Show total count, no hard limit shown
- If count >= 8, show an amber warning icon next to the value
- Tooltip on warning icon: "One or more Linode interfaces is
  approaching the limit of 10 routes. Review your interface
  routes to avoid hitting the limit."

Recalculate all counters after every create, edit, or delete.

---

TOOLBAR

A single horizontal row above the table containing:

Left side (in this order):
- Search input — placeholder "Search by destination…"
- Type filter dropdown — options: All · Interface · Gateway ·
  Blackhole · Platform · BGP
- Local routes toggle — text button or pill toggle, labels:
  "Show local routes (12)" (default) / "Hide local routes" (active)

Right side:
- Blue "Add Route" primary button

All three left-side controls share the same row and vertical
alignment with consistent spacing.

---

ROUTE TABLE

Columns in this order:
1. Label
2. Destination
3. Nexthop Type
4. Mode
5. Next Hop
6. Actions

Column 1 — Label
- Monospace font
- Populated from the label field in the database

Column 2 — Destination
- Monospace font
- Populated from the destination field

Column 3 — Nexthop Type
A Badge component with these variants and tooltips on hover:
- interface_id: slate badge, label "Interface"
  Tooltip: "Routes traffic to a specific Linode network interface
  within this VPC."
- gateway_id: slate badge, label "Gateway"
  Tooltip: "Routes traffic through a gateway resource, such as
  a NAT Gateway."
- blackhole: amber badge, label "Blackhole"
  Tooltip: "Drops all traffic to this destination."
- platform: slate badge with lock icon, label "Platform"
  Tooltip: "Managed by the platform. Cannot be edited or deleted."

For the row with destination 10.3.0.0/24, show an additional small
"ECMP" badge next to the Nexthop Type badge.

Column 4 — Mode
A Badge component:
- static: blue badge, label "Static"
- bgp: indigo badge, label "BGP"
- For blackhole rows where mode is null, show no badge or "—"

Column 5 — Next Hop
- For interface_id and gateway_id rows: show the nexthop ID value
  in monospace
- For blackhole rows: show "Traffic silently dropped" in muted italic
- For platform rows with nexthop = "internet-gateway": show
  "Internet gateway" with a small $ icon. Tooltip on $ icon hover:
  "Egress traffic via this route is billed."
- For platform rows with nexthop = "local": show "local (VPC)"
  in muted text

Column 6 — Actions
- For editable rows (is_editable = true): show Edit and Delete
  icon buttons, both enabled
- For non-editable rows (Platform, BGP): show Edit and Delete
  icons in a disabled/muted state. Tooltip on hover over either:
  "This route is managed by the platform and cannot be modified."
- Note: Blackhole routes are user-owned even though they may appear
  system-generated. If is_editable = true on a blackhole route,
  the actions are enabled.

Visual treatment:
- Subtly tint or indicate read-only rows so users can distinguish
  them at a glance (light background tint or lock icon)
- Render each row dynamically from a live SELECT query:
  SELECT * FROM routes ORDER BY created_at ASC

---

TABLE FOOTER

Below the table, show a row count:
"Showing [n] routes · 12 platform local routes hidden" (default)
"Showing [n] routes · local routes visible" (when toggle is active)

---

LIVE SEARCH BEHAVIOR

The search input filters the destination column live, debounced 300ms:
  SELECT * FROM routes
  WHERE destination ILIKE '%[search term]%'
  ORDER BY created_at ASC

Combine with the type filter when both are active.

If no rows match, show an empty state inside the table:
- Magnifying glass icon
- Heading: "No routes found"
- Body: "No routes match '[search term]'. Try a different
  destination."

---

TYPE FILTER BEHAVIOR

When a type is selected from the dropdown:
  SELECT * FROM routes
  WHERE nexthop_type = '[selected type]'
  ORDER BY created_at ASC

For "BGP" filter option, query WHERE mode = 'bgp' instead.
"All" removes the WHERE clause.

---

LOCAL ROUTES TOGGLE BEHAVIOR

When toggled to "Hide local routes" (active state):
- Insert 4 representative expanded local route rows directly below
  the 10.0.0.0/16 placeholder row, slightly indented or with a
  subtle left border to indicate grouping:
    SM-L01 · 10.0.0.1/32 · Platform · — · local · locked
    SM-L02 · 10.0.0.2/32 · Platform · — · local · locked
    SM-L03 · 10.0.0.3/32 · Platform · — · local · locked
    SM-L04 · 10.0.0.4/32 · Platform · — · local · locked
- Show muted note below the 4 rows: "Showing 4 of 12 local routes"
- Update footer to "Showing [n] routes · local routes visible"

When toggled back to "Show local routes (12)":
- Hide the 4 expanded rows
- Restore default footer

---

ADD ROUTE DRAWER

Triggered by clicking "Add Route". Renders as a right-side slide-in
drawer overlaying the page with a dimmed background.

Drawer header:
- Title: "Add Route"
- Subtitle: "vpc-prod-us-east"
- Close (×) icon top-right

Drawer body — informational banner at the top:
- Blue info variant with info circle icon
- Text: "To route traffic across multiple paths to the same
  destination, create separate routes with the same destination
  and different nexthops (ECMP)."

Drawer body — form fields in this order:

Field 1 — Label
- Required text input
- Helper text: "1–64 characters. Letters, numbers, and hyphens
  only. No consecutive dashes (e.g. rt-web-01)."
- Validation:
  - Min 1, max 64 characters
  - Pattern: ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$
  - No consecutive dashes
  - Inline error: "Label must be 1–64 characters. Only letters,
    numbers, and hyphens allowed. Consecutive dashes are
    not permitted."

Field 2 — Destination CIDR
- Required text input, monospace
- Placeholder: "e.g. 10.2.0.0/24 or 2001:db8::/32"
- Helper text: "Enter an IPv4 or IPv6 CIDR block"
- Validation:
  - IPv4 CIDR pattern: ^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$
  - IPv6 CIDR pattern: ^[0-9a-fA-F:]+\/\d{1,3}$
  - IPv4 prefix length 0–32, IPv6 prefix length 0–128
  - Must not equal or be a sub-prefix of 10.0.0.0/16
    (the VPC top-level prefix). Inline error:
    "This destination overlaps with the VPC address space and
    cannot be used as a custom route."
  - Uniqueness check on the combination of
    (destination + nexthop_type + nexthop). Same destination
    with a different nexthop is allowed (ECMP). Conflict error:
    "A route with this destination and nexthop combination
    already exists."

Field 3 — Nexthop Type
A selection card group with three options:

Option 1 — "Interface ID"
Description: "Route traffic to a Linode network interface"
When selected: shows Nexthop select dropdown filtered to interfaces

Option 2 — "Gateway ID"
Description: "Route traffic through a gateway resource"
When selected: shows Nexthop select dropdown filtered to gateways

Option 3 — "Blackhole"
Description: "Silently drop all traffic to this destination"
When selected: hides the Nexthop field entirely

Field 4 — Nexthop (conditional)
Visible only when Interface ID or Gateway ID is selected.

Select dropdown populated by:
  SELECT id, label, type FROM nexthop_options
  ORDER BY type, label

Filter:
- Interface ID selected: WHERE type = 'interface_id'
  Placeholder: "Select a Linode interface"
- Gateway ID selected: WHERE type = 'gateway_id'
  Placeholder: "Select a gateway"

Each dropdown option displays the full label field.
On submit, save the selected option's id as the nexthop value.

---

ADD ROUTE SUBMIT BEHAVIOR

Limit checks before insert:

Blackhole selected:
  SELECT COUNT(*) FROM routes
  WHERE nexthop_type = 'blackhole' AND is_editable = true
  If count >= 25: disable submit, show inline error:
  "Blackhole route limit reached (25 of 25 used). Delete an
  existing blackhole route to add a new one."

Interface ID or Gateway ID selected:
  SELECT COUNT(*) FROM routes
  WHERE nexthop_type IN ('interface_id', 'gateway_id')
  AND is_editable = true
  If count >= 10: disable submit, show inline error:
  "Interface and gateway route limit reached for one or more
  Linode interfaces. Review existing routes before adding
  new ones."

On valid submit:
  INSERT INTO routes
    (label, destination, nexthop_type, nexthop, mode, status,
     is_editable)
  VALUES
    ('[label]', '[destination]', '[type]', '[nexthop or null]',
     'static', 'active', true)

After successful insert:
- Close the drawer
- Refresh the table
- Refresh the limits card
- Show success toast: "Route added successfully."

On error: keep drawer open, show red inline error:
"Something went wrong. Please try again."

---

EDIT ROUTE DRAWER

Triggered by Edit icon on any editable row. Identical structure
to the Add drawer with these differences:

- Title: "Edit Route"
- Destination field: pre-filled and disabled (cannot be changed
  after creation)
- All other fields: pre-filled with the row's current values
- Conflict validation error on destination is removed
- Primary button label: "Save Changes"

For blackhole routes specifically, show a prominent informational
banner at the top of the drawer (replacing or in addition to the
ECMP banner):

- Blue info variant with info circle icon
- Text: "Updating the next hop will attempt to restore this route
  to Active. The route will return to Blackhole if the target
  remains unreachable."

On save:
  UPDATE routes
  SET label = '[label]',
      nexthop_type = '[type]',
      nexthop = '[nexthop or null]',
      updated_at = now()
  WHERE id = '[row id]'

After successful update:
- Close the drawer
- Refresh the table row in place
- Refresh the limits card
- Show success toast: "Route updated successfully."

---

DELETE CONFIRMATION MODAL

Triggered by Delete icon on any editable row. Modal overlays the
page with a dimmed background.

Modal content:
- Title: "Delete Route"
- Body: "Are you sure you want to delete the route to
  [destination]? This action cannot be undone."
- Footer: gray "Cancel" button (left), red "Delete Route"
  button (right)

On Cancel: close modal, return to page.
On Confirm:
  DELETE FROM routes WHERE id = '[row id]'

After successful delete:
- Close the modal
- Remove the row from the table
- Refresh the limits card
- Show success toast: "Route deleted."

---

GLOBAL ERROR HANDLING

If any Supabase query fails, show a non-blocking error banner at
the top of the Route Table tab content area:

"Unable to load routes. Check your connection and try again."
with a "Retry" link that re-runs the last failed query.

On network error during table render, preserve the last
successfully loaded rows if available — do not show empty state.

---

IMPORTANT BEHAVIORAL NOTES

- Blackhole routes are user-owned. Edit and Delete are enabled
  on user-created blackhole rows (is_editable = true). Only Platform
  and BGP rows have disabled actions.
- Nexthop is never a free-text IP. Always a select from
  nexthop_options for Interface ID and Gateway ID, hidden for
  Blackhole.
- ECMP is created by adding a second route with the same
  destination and a different nexthop — no UI for "add another
  next hop" within a single route.
- The combination (destination + nexthop_type + nexthop) must be
  unique. Same destination with different nexthops is allowed.
- All route types except Platform have edit and delete enabled
  when is_editable = true.
- Destination cannot equal or be a sub-prefix of the VPC prefix
  (10.0.0.0/16).