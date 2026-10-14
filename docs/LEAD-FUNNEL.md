# Lead funnel — complete workflow

Based on the application code as of 14 October 2026. These diagrams describe the implemented paths and the staff actions connecting them. Arrows labelled with an action require that action; they do not imply automatic transitions.

## 1. Source → owner → first consultation

```mermaid
flowchart TD
    SOURCE{Lead source}
    SOURCE -->|CDT / Phone / LinkedIn| CALLER[Validate phone; create lead]
    CALLER --> ROTATE[Assign through caller rotation]
    ROTATE --> CALL[Calling queue: contact and qualify]
    CALL --> PICKED{Call Picked?}
    PICKED -->|No| CALLBACK[Call attempt only; next-day IST follow-up]
    CALLBACK --> CALL
    PICKED -->|Yes| CONSULT[Calling consultation: interest, optional follow-up, Group Created]
    CALL -->|Field meeting needed| ASSIGN[Manager assigns ground owner]
    CALL -->|Store meeting needed| STORE[Schedule store appointment]

    SOURCE -->|Walk-in| WALK[Contact name + phone; lead and initial consultation saved together]
    WALK --> STOREOWNER[Store handling; creator owns it if a store associate, otherwise caller assignment]
    STOREOWNER --> CONSULT
    SOURCE -->|Manual / Head-created| HEAD[Head only: phone required; lead and initial consultation saved together]
    HEAD --> CONSULT
    SOURCE -->|Google Maps / Book Directory| GROUND[Company + owner + address + PIN + phone]
    GROUND --> GEO{Location and assignment ready?}
    GEO -->|No| FIX[Mapping / data correction; confirm location and store]
    FIX --> GEO
    GEO -->|Yes| ASSIGN
    ASSIGN --> ROUTE[Route Builder: plan and assign field visit]
    ROUTE --> FIELD[Assigned field owner visits]
    FIELD --> CONSULT
    ASSIGN -->|Eligible first ad-hoc visit| CONSULT
    STORE --> ARRIVE[Store meeting occurs; record consultation separately]
    ARRIVE --> CONSULT

    HEADNOTE[The B2B Head can be a field owner and submit consultations while retaining the Head role]
    HEADNOTE -.-> ASSIGN
    HEADNOTE -.-> FIELD
```

- Intake validation failures return for correction. Duplicate checks direct staff to the existing lead; they do not create a second lead.
- Bulk imports use explicit sources and source-specific fields. Manual and walk-in intake use the single-lead flow so the initial consultation is saved atomically.
- If caller rotation has no eligible staff, assignment needs attention; a field owner is not inferred from the source.
- A scheduled visit belongs to its assigned person: another person, including the Head, cannot file that person's scheduled visit. Assign the visit to the actual submitter. Vineet Shinde is the B2B Head, not a separate ground representative.

## 2. Consultation → outcome → next action

```mermaid
flowchart TD
    C[Save consultation: author, date, notes, interest and outcome] --> O{Outcome}
    O -->|Nurturing required| I{Interest level}
    I -->|High| HOT[Hot]
    I -->|Medium| WARM[Warm]
    I -->|Low| COLD[Cold / manager review workflow]
    I -->|Not recorded in minimal or historical data| CONSULTED[Consulted]
    HOT --> ACTION{Next staff action}
    WARM --> ACTION
    CONSULTED --> ACTION
    ACTION -->|Keep nurturing| FOLLOW[Set follow-up date]
    FOLLOW --> CONTACT[Call or eligible revisit]
    CONTACT --> C
    ACTION -->|Ready to submit| ONBOARD[Partner onboarding form]
    ACTION -->|Meet at store| BOOK[Schedule store appointment]

    O -->|Visit scheduled| BOOK
    BOOK --> MEETING{Appointment outcome}
    MEETING -->|Completed| STORE[Record store consultation separately]
    STORE --> C
    MEETING -->|Cancelled| NEXT[Choose new appointment or follow-up]
    NEXT --> ACTION

    O -->|Dont want commission| REVIEW[Needs Manager Review]
    O -->|Wrong Location / Office closed| DATA[Needs Data Correction]
    DATA --> CORRECT[Correct current address / coordinates; retain original intake]
    CORRECT --> REASSESS[Reassess; assign or schedule eligible contact]
    REASSESS --> CONTACT
    O -->|Lost: does not do tiles business| LOST[Closed-Lost]
    O -->|Historical On-boarding Done / Converted| READY[Ready for Onboarding until linked active partner exists]
    READY --> ONBOARD
    COLD --> REVIEW
    C -.->|Configured cold rule: low interest, commission declined, or not-interested checklist| REVIEW
```

Booking a store appointment does not create a consultation. A follow-up date is a reminder, not a store appointment or field route. Store appointments can also be booked independently of a consultation.

The current consultation form excludes “On-boarding Done”; actual onboarding uses the partner form. Historical records can still contain that outcome. Cold rules exclude final onboarding, lost and location-correction outcomes.

## 3. Field visits, missed visits and repeat consultations

```mermaid
flowchart TD
    PLAN[Assigned eligible field visit] --> RESULT{Visit result}
    RESULT -->|Met lead| FIRST[Submit consultation; mark visit completed]
    RESULT -->|Cannot complete / missed| REQUEST[Record reason and request reschedule]
    REQUEST --> MANAGER{Manager decision}
    MANAGER -->|Approve and choose date| RESCHEDULE[Rescheduled visit]
    RESCHEDULE --> PLAN
    MANAGER -->|Reject| KEEP[Keep existing schedule; resolve next action]
    KEEP --> PLAN
    FIRST --> AGAIN{Another contact needed?}
    AGAIN -->|Yes| REVISIT[Schedule or log eligible revisit]
    REVISIT --> WHEN{Revisit date}
    WHEN -->|Future| WAIT[Scheduled revisit; no completed consultation yet]
    WAIT --> REVISIT
    WHEN -->|Today| OUT{Revisit outcome}
    OUT -->|Ready for onboarding| PARTNER[Open partner onboarding]
    OUT -->|Follow-up needed| DATE[Next follow-up date required]
    DATE --> REVISIT
    OUT -->|Not interested| NOTES[Record result; assess manager review / closure]
    OUT -->|Could not meet| RETRY[Record result; arrange next contact]
    RETRY --> REVISIT
    AGAIN -->|No| CURRENT[Retain latest outcome / continue onboarding]
```

Completed visits cannot be filed again; repeat field work needs an eligible new visit. Caller/store/Head intake owners can append fuller consultations to their own intake records without a ground route. Store-owned revisits use consultation/reminder history rather than ground route visits. A manager may directly reschedule with a date; a representative's request does not change the date until approval.

Revisit outcomes are recorded as history. “Not interested” on the short revisit form is not the same operation as the manager's explicit Closed-Lost action, and the short form does not itself create an active partner.

## 4. Cold-lead recovery and escalation

```mermaid
flowchart TD
    FLAG[Configured cold rule matches] --> CASE[Open or refresh cold case]
    CASE --> OWNER[Notify store manager; fallback regional manager, then Head]
    OWNER --> CALL[Manager logs call with notes]
    CALL --> OUTCOME{Call outcome}
    OUTCOME -->|Reactivated| ACTIVE[Resolve case; Assigned; follow-up date required]
    ACTIVE --> FIELD[Follow-up / eligible visit / consultation]
    OUTCOME -->|Call back later| LATER[Keep case open; callback date required]
    LATER --> REMINDER[Due callback reminder]
    REMINDER --> CALL
    OUTCOME -->|Not interested| LOST[Reason required; Closed-Lost; resolve case and stop follow-ups]
    OUTCOME -->|Converted| LEGACY[Mark lead onboarded; resolve case and stop follow-ups]
    LEGACY --> VERIFY[Ensure partner onboarding is completed; call alone creates no partner]
    CASE -.->|48 hours without a logged call, while awaiting review| HEAD[Head escalation reminder]
    CORRECTION[Needs Data Correction] -.->|48 hours without recorded handling| HEAD
```

The Head's cold list also includes latest low-interest consultations, even without an open cold case. The manager-call endpoint requires an active case. Scheduled reminders and escalations require the worker to be running; the migration handoff says production workers are not yet deployed.

## 5. Onboarding, approval, rejection and direct partners

```mermaid
flowchart TD
    READY[Lead ready to onboard] --> FORM[Complete partner details and required documents]
    DIRECT[Direct partner / referral; linked lead optional] --> FORM
    FORM --> VALID{Valid details and distinct partner identity?}
    VALID -->|No| FIX[Correct form or open existing partner]
    FIX --> FORM
    VALID -->|Yes| WHO{Submitter role}
    WHO -->|Ground representative| PENDING[Onboarding Pending / pending review]
    PENDING --> REVIEW{Head or regional manager reviews}
    REVIEW -->|Approve| ACTIVE[Active partner with permanent partner code]
    REVIEW -->|Reject with reason| REJECTED[Rejected submission; notify submitter]
    REJECTED --> CORRECT[Authorized user corrects and resubmits]
    CORRECT --> PENDING
    WHO -->|Head / regional manager / store associate / super admin| ACTIVE
    ACTIVE --> LINK{Linked source lead?}
    LINK -->|Yes| WON[Lead Onboarded / Won; deactivate follow-ups]
    LINK -->|No| DIRECTORY[Partner directory; no lead automatically created]
    WON --> STOP[Exclude from calling / cold / follow-up queues; block calls and revisits]
    ACTIVE --> MAINTAIN[Head / manager maintains active partner details]
```

The analyst is read-only. The current partner-create endpoint activates non-ground, non-analyst submissions directly, including store-associate submissions. A referral must point to an active partner. Different named contacts at one company may have separate partner codes; exact company/contact/designation duplicates are rejected. Rejection of an onboarding form is not automatically a lost lead. Existing partner imports can create partner records outside the consultation path.

## 6. How the displayed funnel status is selected

The map/dashboard derives status from current relationships and history; it does not simply display the stored lead status. The first matching rule wins:

```mermaid
flowchart TD
    START[Compute visible funnel status] --> ACTIVE{Linked active partner?}
    ACTIVE -->|Yes| WON[Onboarded]
    ACTIVE -->|No| EDIT{Explicit funnel edit newer than latest consultation?}
    EDIT -->|Yes| OVERRIDE[Use edited funnel status]
    EDIT -->|No| PENDING{Linked pending partner?}
    PENDING -->|Yes| WAIT[Onboarding Pending]
    PENDING -->|No| OUTCOME{Latest consultation outcome}
    OUTCOME -->|Lost| LOST[Lost]
    OUTCOME -->|Wrong location / office closed| DATA[Needs Data Correction]
    OUTCOME -->|Commission declined| REVIEW[Needs Manager Review]
    OUTCOME -->|Other| VISIT{Scheduled store appointment or Visit scheduled outcome?}
    VISIT -->|Yes| BOOKED[Visit Scheduled]
    VISIT -->|No| READY{Historical onboarding / converted outcome?}
    READY -->|Yes| FORM[Ready for Onboarding]
    READY -->|No| INTEREST{Latest consultation interest}
    INTEREST -->|High| HOT[Hot]
    INTEREST -->|Medium| WARM[Warm]
    INTEREST -->|Low / Not interested| COLD[Cold]
    INTEREST -->|Other / absent| HAS{Consultation exists?}
    HAS -->|Yes| CONSULTED[Consulted]
    HAS -->|No| STORED[Use recognized stored status; otherwise Assigned if owner/store exists, else New]
```

### Current implementation caveats

- Manager-call outcomes change the stored status but do not update the latest consultation or create an explicit funnel-status override. A map badge can therefore retain the older consultation's classification after a manager call.
- The short revisit outcome “Ready for onboarding” is not explicitly recognized by the funnel-status resolver; the older “On-boarding Done” / “Converted” values are. A ready revisit can therefore still display its carried-forward interest level.
- Correcting coordinates or completing/cancelling a store appointment does not rewrite an older consultation outcome. A later consultation or supported status action may still be needed to change its displayed classification.
- Active partner linkage takes precedence over these historical labels and overrides. The legacy manager-call “Converted” action does not itself create that linkage.

These are descriptions of current behavior, not changes made as part of this diagram.

### Implementation references

- Intake and creation: `src/lib/leads/intake.ts`, `src/app/api/leads/route.ts`
- Calling: `src/app/api/leads/[id]/calls/route.ts`
- Consultation and visit eligibility: `src/app/api/consultations/route.ts`, `src/lib/routes/consultation-visit.ts`
- Revisit and reschedule: `src/app/api/leads/[id]/revisit/route.ts`, `src/app/api/visits/[id]/reschedule/route.ts`
- Cold rules and recovery: `src/lib/cold/rules.ts`, `src/lib/cold/service.ts`, `src/lib/cold/jobs.ts`, `src/app/api/cold-leads/[id]/calls/route.ts`
- Partner submission/review: `src/app/api/partners/route.ts`, `src/app/api/partners/[id]/route.ts`
- Displayed status: `src/lib/leads/funnel-status.ts`

### Calling form update — 14 October 2026

Calling consultations are distinct from field consultations. Call Picked = No records an attempt and tomorrow's IST follow-up without changing interest or counting a consultation. Yes records only interest, optional follow-up and Group Created; complete information stays in the separate lead-details action. Group Created can be updated later using its checkbox and Apply button. Phone follow-ups do not complete field visits or change their assigned owner.

### Spreadsheet import routing — 14 October 2026

Imported lead source is preserved exactly for context. A lead with valid India coordinates enters the ground/Route Builder pool whether or not it has a phone number. A lead without valid coordinates enters Calling Queue and is hidden from Route Builder; Route Builder reports its count by selected PIN. Once staff complete and verify that lead's location, it moves into the ground route workflow while its source and original intake remain unchanged. Route Builder supports selecting several PINs together and manually searching for an eligible lead by ID, company, contact or phone.
