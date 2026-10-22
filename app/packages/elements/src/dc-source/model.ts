import type { ModelFactory } from "../api";
import { DcSourceModel } from "../battery/model";
import { init } from "../shared/modelKit";

export const dcSourceModel: ModelFactory = (el) => init(new DcSourceModel(el), el);
