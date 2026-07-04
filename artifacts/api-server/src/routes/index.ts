import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fingerprintRouter from "./fingerprint";
import verifyRouter from "./verify";
import existsRouter from "./exists";
import profileRouter from "./profile";
import changeVisibilityRouter from "./change-visibility";
import historyRouter from "./history";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fingerprintRouter);
router.use(verifyRouter);
router.use(existsRouter);
router.use(profileRouter);
router.use(changeVisibilityRouter);
router.use(historyRouter);

export default router;
