import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fingerprintRouter from "./fingerprint";
import verifyRouter from "./verify";
import profileRouter from "./profile";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fingerprintRouter);
router.use(verifyRouter);
router.use(profileRouter);

export default router;
