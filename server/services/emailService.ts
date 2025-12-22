import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

// Load email template
const verificationEmailTemplatePath = path.join(process.cwd(), 'emailTemplates', 'verificationCode.html');
let verificationEmailTemplate = '';
try {
    verificationEmailTemplate = fs.readFileSync(verificationEmailTemplatePath, 'utf8');
} catch (e) {
    console.error('Failed to load email template:', e);
}

// Load murchat.ico and convert to Base64 (or use URL)
// Keeping the URL fallback as in original code
const murchatIconBase64 = "https://lh3.googleusercontent.com/a-/ALV-UjXXixsPT7S50HzxmbFn0p1jcDlyDaBQKONr_RLULJDonpDgKQE=s40-p"; 

// --- EMAIL SETUP ---
// You MUST replace with your actual SMTP settings for real email sending.
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', // For Gmail
    port: 587, // Try 587 (STARTTLS)
    secure: false, // Use false for 587
    auth: {
        user: 'mursuportstop@gmail.com', // Your Gmail address
        pass: 'upyc yhnr piee ahxx'    // Your Gmail App Password
    }
});

export async function sendVerificationCode(email: string, code: string, username: string) {
    console.log(`[EMAIL] Attempting to send verification code to ${email}: ${code}`);
    console.log(`[DEBUG] Verification Code for ${email}: ${code}`); // DEBUG LOG
    
    if (!verificationEmailTemplate) {
        console.error('[EMAIL ERROR] Template not loaded');
        return;
    }

    // Replace placeholders in HTML template
    let htmlContent = verificationEmailTemplate
        .replace(/{{username}}/g, username)
        .replace(/{{code}}/g, code)
        .replace(/{{murchat_icon_base64}}/g, murchatIconBase64);

    try {
        await transporter.sendMail({
            from: '"MurCHAT Verification" <mursuportstop@gmail.com>',
            to: email,
            subject: 'Ваш код подтверждения MurCHAT',
            html: htmlContent
        });
        console.log(`[EMAIL] Verification code sent to ${email}`);
    } catch (e) {
        console.error(`[EMAIL ERROR] Failed to send email to ${email}:`, e);
    }
}
