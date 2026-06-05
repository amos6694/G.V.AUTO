import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fingerprintRouter from "./fingerprint";
import verifyRouter from "./verify";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fingerprintRouter);
router.use(verifyRouter);

export default router;
