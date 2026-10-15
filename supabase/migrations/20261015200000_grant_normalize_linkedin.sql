-- Fundet af adgangstesten: den genererede kolonne contact.linkedin_norm kalder funktionen som den ændrende bruger.
grant execute on function private.normalize_linkedin(text) to authenticated;
