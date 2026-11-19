const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function wrap(title, intro, link, buttonLabel, outro) {
  const text = `${title}\n\n${intro}\n\n${buttonLabel}: ${link}\n\n${outro}\n\n— LouDent Dental Clinic`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;color:#10213f">
<h2 style="color:#2563eb">${esc(title)}</h2><p>${esc(intro)}</p>
<p><a href="${esc(link)}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${esc(buttonLabel)}</a></p>
<p style="font-size:12px;color:#5b6b85">If the button does not work, copy this link into your browser:<br>${esc(link)}</p>
<p style="font-size:12px;color:#5b6b85">${esc(outro)}</p></div>`;
  return { text, html };
}

export function verificationEmail({ name, link, hours }) {
  const body = wrap('Verify your email address', `Hi ${name || 'there'}, please confirm this email address to finish setting up your LouDent account.`, link, 'Verify email', `This link works once and expires in ${hours} hours. If you did not create a LouDent account, you can ignore this email.`);
  return { subject: 'Verify your LouDent email address', ...body };
}

export function passwordResetEmail({ name, link, minutes }) {
  const body = wrap('Reset your LouDent password', `Hi ${name || 'there'}, we received a request to reset your password.`, link, 'Choose a new password', `This link works once and expires in ${minutes} minutes. If you did not ask for this, ignore this email; your password has not changed. We never email your current password.`);
  return { subject: 'Reset your LouDent password', ...body };
}
