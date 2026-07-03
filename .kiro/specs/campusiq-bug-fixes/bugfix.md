# Bugfix Requirements Document

## Introduction

This bugfix spec addresses six concrete defects identified during a code review of CampusIQ (Next.js 14 frontend + Node/Express backend + Supabase). The bugs span correctness, security, and configuration concerns:

1. The AI email features use a deprecated Gemini model (`gemini-pro`), causing live API calls to fail.
2. Gmail OAuth tokens are persisted in plaintext despite schema comments claiming they are encrypted, creating a security exposure.
3. The Firebase background service worker ships literal placeholder strings instead of real config, so background push notifications never initialize.
4. The attendance-prompt cron job matches timetable slots using an exact `HH:MM` string equality, which silently fails when the stored `TIME` value is `HH:MM:SS` or when there is any minute drift.
5. The attendance month filter constructs an end date of `${month}-31`, which is an invalid date for months with fewer than 31 days, dropping or erroring on records.
6. The dashboard "Grade Components" stat uses a no-op reducer accumulator, so it always renders `0` regardless of the underlying data.

Each defect is captured below with its current (defective) behavior, expected (correct) behavior, and the surrounding behavior that must be preserved.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the `/api/ai/draft-reply` endpoint is invoked THEN the system requests the Gemini model `gemini-pro`, which is deprecated, and the live API call fails with a model-not-found error.
1.2 WHEN the `/api/ai/smart-categorize` endpoint is invoked THEN the system requests the deprecated `gemini-pro` model and the live API call fails.
1.3 WHEN the Gmail OAuth callback completes THEN the system writes `gmail_access_token` and `gmail_refresh_token` to the `profiles` table as raw plaintext, contradicting the schema comment that states the token is "encrypted".
1.4 WHEN the Firebase background service worker (`firebase-messaging-sw.js`) initializes THEN the system calls `firebase.initializeApp` with literal placeholder strings (e.g. `'NEXT_PUBLIC_FIREBASE_API_KEY'`) instead of real config values, so background messaging never initializes and background push notifications are never received.
1.5 WHEN the per-minute cron job queries for ending timetable slots THEN the system filters with `.eq('end_time', currentTime)` where `currentTime` is `"HH:MM"`, so if the stored `TIME` value serializes as `"HH:MM:SS"` or the tick drifts past the exact minute, no slot matches and the attendance prompt is never sent.
1.6 WHEN a client requests `/api/attendance?month=YYYY-MM` for a month with fewer than 31 days (e.g. February or April) THEN the system builds the upper bound as `${month}-31`, an invalid calendar date, producing incorrect filtering or a query error.
1.7 WHEN the dashboard renders the "Grade Components" stat THEN the system computes `gradesSummary.reduce((s, g) => s, 0)`, a no-op accumulator that ignores every element, so the displayed value is always `0` regardless of the grade data returned.

### Expected Behavior (Correct)

2.1 WHEN the `/api/ai/draft-reply` endpoint is invoked THEN the system SHALL request a current, supported Gemini model so the reply-draft generation succeeds against the live API.
2.2 WHEN the `/api/ai/smart-categorize` endpoint is invoked THEN the system SHALL request a current, supported Gemini model so categorization succeeds against the live API.
2.3 WHEN the Gmail OAuth callback completes THEN the system SHALL store `gmail_access_token` and `gmail_refresh_token` in encrypted form (and decrypt them on read) so that persisted tokens are never readable as plaintext, matching the schema's stated guarantee.
2.4 WHEN the Firebase background service worker initializes THEN the system SHALL call `firebase.initializeApp` with the real Firebase configuration values so background messaging initializes and background push notifications are received.
2.5 WHEN the per-minute cron job queries for ending timetable slots THEN the system SHALL match slots whose `end_time` falls within the current minute regardless of seconds precision or sub-minute drift, so the attendance prompt is reliably sent when a slot ends.
2.6 WHEN a client requests `/api/attendance?month=YYYY-MM` THEN the system SHALL compute the correct last day of that month so all records within the month are returned and no invalid-date error occurs.
2.7 WHEN the dashboard renders the "Grade Components" stat THEN the system SHALL display the actual count (or aggregated total) of grade components derived from `gradesSummary` so the value reflects the real data.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the `/api/ai/draft-reply` and `/api/ai/smart-categorize` endpoints succeed THEN the system SHALL CONTINUE TO save the generated draft to the `emails.ai_reply_draft` column and return the category/draft in the response as it does today.
3.2 WHEN a Gmail token is read for the `/sync`, `/status`, and `send-reply` flows THEN the system SHALL CONTINUE TO authenticate and operate correctly using the stored credentials.
3.3 WHEN a foreground push notification or notification click occurs THEN the system SHALL CONTINUE TO show the notification and POST to `/api/attendance/respond-notification` with the correct action as it does today.
3.4 WHEN a timetable slot's `end_time` does not fall within the current minute THEN the system SHALL CONTINUE TO NOT send an attendance prompt for that slot.
3.5 WHEN a client requests `/api/attendance` without a `month` parameter, or for a 31-day month, or with a `subject_id` filter THEN the system SHALL CONTINUE TO return the same correctly filtered records it returns today.
3.6 WHEN the dashboard renders the other stat cards (Overall Attendance, Subjects Tracked, Gmail) and the grade summary list THEN the system SHALL CONTINUE TO display the same values and layout as today.

## Bug Condition Analysis

The following pseudocode captures the bug condition `C(X)` and the desired property `P(result)` for each defect. `F` is the original (unfixed) code and `F'` is the fixed code.

### Bug 1 & 2 — Deprecated Gemini model

```pascal
FUNCTION isBugCondition(X)
  INPUT: X = an AI request to draft-reply or smart-categorize
  OUTPUT: boolean
  RETURN X.modelName = 'gemini-pro'   // deprecated model
END FUNCTION

// Property: Fix Checking
FOR ALL X WHERE isBugCondition(X) DO
  result ← F'(X)
  ASSERT result.modelName IS a currently supported Gemini model
         AND live_call_does_not_fail_with_model_error(result)
END FOR
```

### Bug 3 — Plaintext Gmail tokens

```pascal
FUNCTION isBugCondition(X)
  INPUT: X = a token persistence operation on profiles
  OUTPUT: boolean
  RETURN X.column IN {gmail_access_token, gmail_refresh_token}
END FUNCTION

// Property: Fix Checking
FOR ALL X WHERE isBugCondition(X) DO
  stored ← F'(X)              // value written to DB
  ASSERT stored ≠ plaintext(X.token)
         AND decrypt(stored) = X.token
END FOR
```

### Bug 4 — Firebase service worker placeholders

```pascal
FUNCTION isBugCondition(X)
  INPUT: X = a config field passed to firebase.initializeApp in the SW
  OUTPUT: boolean
  RETURN X.value IS a literal placeholder string (e.g. starts with 'NEXT_PUBLIC_')
END FUNCTION

// Property: Fix Checking
FOR ALL X WHERE isBugCondition(X) DO
  result ← F'(X)
  ASSERT result.value IS a real Firebase config value
         AND messaging_initializes_successfully()
END FOR
```

### Bug 5 — Fragile cron exact-minute matching

```pascal
FUNCTION isBugCondition(X)
  INPUT: X = (slot.end_time, now)
  OUTPUT: boolean
  // Bug triggers when the slot ends this minute but exact string eq fails
  RETURN minute_of(slot.end_time) = minute_of(now)
         AND string(slot.end_time) ≠ "HH:MM"(now)
END FUNCTION

// Property: Fix Checking
FOR ALL X WHERE isBugCondition(X) DO
  matched ← F'(X)
  ASSERT matched = true   // slot is selected and prompt is sent
END FOR
```

### Bug 6 — Attendance month off-by-days

```pascal
FUNCTION isBugCondition(X)
  INPUT: X = month string "YYYY-MM"
  OUTPUT: boolean
  RETURN days_in_month(X) < 31   // Feb, Apr, Jun, Sep, Nov
END FUNCTION

// Property: Fix Checking
FOR ALL X WHERE isBugCondition(X) DO
  upperBound ← F'(X)
  ASSERT upperBound = last_valid_date_of(X)
         AND query_returns_all_records_in(X)
END FOR
```

### Bug 7 — Dashboard Grade Components stat

```pascal
FUNCTION isBugCondition(X)
  INPUT: X = gradesSummary array
  OUTPUT: boolean
  RETURN length(X) > 0   // any non-empty data exposes the no-op reducer
END FUNCTION

// Property: Fix Checking
FOR ALL X WHERE isBugCondition(X) DO
  displayed ← F'(X)
  ASSERT displayed = expected_grade_component_count(X)
         AND displayed > 0
END FOR
```

### Preservation Goal (all bugs)

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

For non-buggy inputs — already-supported model names, successful token reads, real config values, slots outside the current minute, 31-day months, and empty grade summaries — the fixed code behaves identically to the original.
