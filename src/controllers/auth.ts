import { asyncHandler } from "../middlewares/asyncHandlerFn";
import bcrypt from "bcryptjs";
import crypto from 'crypto';
import jwt from "jsonwebtoken";
import sgMail from "@sendgrid/mail";
import LNPay from "../services/Pay"

const JWT_EXPIRE = process.env.JWT_EXPIRE;
const JWT_SECRET = process.env.JWT_SECRET;

import { User } from "../models/User"
import { ResetCode } from "../models/ResetCode";

// SIGN UP - Creates user model, adds salt to password, creates a JWT
export const signup = asyncHandler(async (req: any, res: any) => {
    try {
        const newUser = new User(req.body);

        const result = await LNPay.createWallet(req.body.username);
        newUser.wallet = { ...result }

        const salt = await bcrypt.genSalt(10);
        newUser.password = await bcrypt.hash(newUser.password, salt);
        const user = await newUser.save();


        const payload = {
            userId: user._id,
            username: user.username,
            walletId: user.wallet.id,
            recieveKey: user.wallet.recieveKey,
        };

        if (!JWT_SECRET) {
            res.status(500).json({ success: false, message: "Server Error" });
            return
        }

        const token = jwt.sign(payload, JWT_SECRET, {
            expiresIn: JWT_EXPIRE,
        });

        res.status(200).json({ success: true, token, expiresIn: JWT_EXPIRE });
    } catch (err) {
        console.log({ err });
    }
});

// LOGIN
export const login = async (req: any, res: any) => {
    const { password, email } = req.body;

    try {
        let user;
        if (email) user = await User.findOne({ email });


        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            res.status(401).json({ success: false, message: "Incorrect Password" });
            return;
        }

        const payload = {
            userId: user._id,
            username: user.username,
            walletId: user.wallet.id,
            recieveKey: user.wallet.recieveKey,
        };

        if (!JWT_SECRET) {
            res.status(500).json({ success: false, message: "Server Error" });
            return
        }

        const token = jwt.sign(payload, JWT_SECRET, {
            expiresIn: JWT_EXPIRE,
        });

        res
            .status(200)
            .json({ success: true, token, message: "Successfully logged in" });
    } catch (err) {
        console.log("Error with auth -> /login endpoint");
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const initiateResetPassword = async (req: any, res: any) => {
    const { email } = req.body
    // Check email exists in db
    const foundUser = await User.findOne({ email });
    if (!foundUser) {
        res.status(404).json({ success: false, message: "No user with that email address" });
        return
    }

    // Delete old codes with that email
    await ResetCode.deleteMany({ email })

    // Generate a code
    const randomBytes = crypto.randomBytes(2)
    const code = parseInt(randomBytes.toString('hex'), 16)

    // Save the code in the database with the userid and username, and email
    const newCode = new ResetCode({ email, code });
    await newCode.save();

    // Send the code to the email adddress
    sgMail.setApiKey(process.env.SENDGRID_API_KEY ?? "")
    const msg = {
        to: 'dr.mcgrane@gmail.com', // Change to your recipient
        from: 'dr.mcgrane@gmail.com', // Change to your verified sender
        subject: 'Reset your password',
        text: code.toString(),
    }
    sgMail
        .send(msg)
        .then(() => {
            console.log('Email sent')
        })
        .catch((error: any) => {
            console.error(error)
        })

}

export const authenticateResetCode = async (req: any, res: any) => {
    const { code, email } = req.body

    const foundCode = await ResetCode.findOne({ email, code });

    if (!foundCode) {
        res.status(401).json({ success: false, message: "Code incorrect" });
        return
    }

    res.status(201).json({ success: true, message: "Code correct" });

}

export const resetNewPassword = async (req: any, res: any) => {
    const { code, email, newPassword } = req.body

    const foundCode = await ResetCode.findOne({ email, code });

    if (!foundCode) {
        res.status(401).json({ success: false, message: "Code incorrect" });
        return
    }

    const salt = await bcrypt.genSalt(10);
    const newPasswordWithSalt = await bcrypt.hash(newPassword, salt);

    const newPass = await User.findOneAndUpdate({ email }, { password: newPasswordWithSalt })

    if (newPass) {
        await ResetCode.findOneAndDelete({ email, code })
    }
    res.status(200).json({ success: true, message: "Password Updated" });
}

export const veryifyDecodeUser = async (req: any, res: any) => {
    try {
        const decoded = await jwt.verify(req.query.token, process.env.JWT_SECRET ?? "");
        console.log({ decoded });
        res.status(200).json({
            success: true,
            message: "Verify decode loud and clear over",
            decoded,
        });
    } catch (err) {
        console.log({ err });
        res.status(403).json({
            success: true,
            message: "You cannot perform this upload.",
        });
    }
};