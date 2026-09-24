# White Mirror auth email templates (Supabase)

Pasted into Supabase → Authentication → Emails → Templates.

Design constraints that drive the markup:
- Table layout with inline styles. Gmail, Outlook and most Egyptian webmail
  strip <style> blocks and ignore flex/grid.
- No web fonts. Lora and Inter do not load in email, so the serif stack falls
  back to Georgia and the sans stack to system UI fonts — the closest match to
  the site without a broken render.
- 600px wide, centred, generous whitespace, hairline rules: the same restraint
  as the site rather than a marketing email.
- The code is the hero. It is the only thing most people open the mail for.
- Light-mode colours stated explicitly; dark-mode clients invert the ground
  themselves and the palette survives it.

Supabase variables: {{ .Token }} (6-digit code), {{ .ConfirmationURL }},
{{ .SiteURL }}, {{ .Email }}.
