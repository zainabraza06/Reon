import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const sendEmail = async ({ to, subject, title, body, buttonText, buttonLink }) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: true, 
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

 
    const html = `
      <div style="font-family: 'Inter', Arial, sans-serif; background-color: #f8fafc; padding: 40px;">
        <table style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #2563EB, #4F46E5); padding: 25px 30px; text-align: center;">
              <h2 style="color: #fff; margin: 0; font-size: 22px;">${title || "Notification"}</h2>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px 40px; text-align: left; color: #333;">
              <div style="font-size: 15px; line-height: 1.7;">
                ${body || "This is a system-generated message."}
              </div>

              ${
                buttonLink
                  ? `
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${buttonLink}" 
                         style="background: #2563EB; color: white; padding: 12px 24px; 
                         text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
                        ${buttonText || "Open Link"}
                      </a>
                    </div>
                  `
                  : ""
              }

              ${
                buttonLink
                  ? `<p style="font-size: 13px; color: #999; text-align: center;">
                       Or copy this link:<br>
                       <span style="color: #2563EB; word-break: break-all;">${buttonLink}</span>
                     </p>`
                  : ""
              }
            </td>
          </tr>
          <tr>
            <td style="background-color: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #777;">
              <p style="margin: 0;">© ${new Date().getFullYear()} Reon Secure Messaging Application</p>
            </td>
          </tr>
        </table>
      </div>
    `;

    const mailOptions = {
      from: `"Reon Application Team" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${to}: ${info.messageId}`);
  } catch (error) {
    console.error("❌ Error sending email:", error);
    throw new Error("Failed to send email");
  }
};

export default sendEmail;
