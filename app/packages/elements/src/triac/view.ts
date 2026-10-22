import { drawDiacBody } from "../diac/view";
import { thyristorView } from "../scr/view";

/** The diac's opposed triangles with a gate from the MT1 plate. */
export const triacView = thyristorView(drawDiacBody, 0.5);
