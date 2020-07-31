/**
 * @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Audit = require('./audit.js');
const i18n = require('../lib/i18n/i18n.js');

const UIStrings = {
  /** Title of a diagnostic LH audit that provides details on animations that are not composited. */
  title: 'Avoid non-composited animations',
  /** Description of a diagnostic LH audit that shows the user animations that are not composited. */
  description: 'Animations which are not composited can be janky and contribute to CLS. ' +
    '[Learn more](https://developers.google.com/web/fundamentals/performance/rendering/stick-to-compositor-only-properties-and-manage-layer-count)',
  /** [ICU Syntax] Label identifying the number of animations that are not composited. */
  displayValue: `{itemCount, plural,
  =1 {# animated element found}
  other {# animated elements found}
  }`,
};

const str_ = i18n.createMessageInstanceIdFn(__filename, UIStrings);

/**
 * Each failure reason is represented by a bit flag. The bit shift operator '<<' is used to define which bit corresponds to each failure reason.
 * https://source.chromium.org/search?q=f:compositor_animations.h%20%22enum%20FailureReason%22
 * @type {{flag: number, text: string}[]}
 */
const ACTIONABLE_FAILURE_REASONS = [
  {
    flag: 1 << 13,
    text: 'Unsupported CSS Property',
  },
];

/**
 * Return list of actionable failure reasons and a boolean if some reasons are not actionable.
 * Each flag is a number with a single bit set to 1 in the position corresponding to a failure reason.
 * We can check if a specific bit is true in the failure coding using bitwise and '&' with the flag.
 * @param {number} failureCode
 * @return {string[]}
 */
function getActionableFailureReasons(failureCode) {
  return ACTIONABLE_FAILURE_REASONS
    .filter(reason => failureCode & reason.flag)
    .map(reason => reason.text);
}

class NonCompositedAnimations extends Audit {
  /**
   * @return {LH.Audit.Meta}
   */
  static get meta() {
    return {
      id: 'non-composited-animations',
      scoreDisplayMode: Audit.SCORING_MODES.INFORMATIVE,
      title: str_(UIStrings.title),
      description: str_(UIStrings.description),
      requiredArtifacts: ['TraceElements', 'HostUserAgent'],
    };
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @return {Promise<LH.Audit.Product>}
   */
  static async audit(artifacts) {
    // COMPAT: This audit requires m86
    const match = artifacts.HostUserAgent.match(/Chrome\/(\d+)/);
    if (!match || Number(match[1]) < 86) {
      return {
        score: 1,
        notApplicable: true,
      };
    }

    /** @type LH.Audit.Details.TableItem[] */
    const results = artifacts.TraceElements
      .filter(element => {
        return element.traceEventType === 'animation' &&
          element.animations && element.animations.find(a => a.failureReasonsMask);
      })
      .map(element => {
        /** @type LH.Audit.Details.NodeValue */
        const node = {
          type: 'node',
          path: element.devtoolsNodePath,
          selector: element.selector,
          nodeLabel: element.nodeLabel,
          snippet: element.snippet,
        };

        const animations = element.animations || [];
        const failureReasons = new Set();
        animations.filter(({failureReasonsMask}) => failureReasonsMask)
          .map(({name, failureReasonsMask}) => {
            const failureStrings = getActionableFailureReasons(failureReasonsMask || 0);
            return {
              name,
              failureStrings,
            };
          })
          .forEach(({name, failureStrings}) => {
            failureStrings.forEach(failureString => {
              failureReasons.add(failureString + (name ? ` ("${name}")` : ''));
            });
          });

        return {
          node,
          failureReasons: '', // TODO: Use for node specific failure reasons (e.g. incompatible animations)
          subItems: {
            type: 'subitems',
            items: [...failureReasons].map(failureReason => {
              return {failureReason};
            }),
          },
        };
      });

    /** @type {LH.Audit.Details.Table['headings']} */
    const headings = [
      /* eslint-disable max-len */
      {key: 'node', itemType: 'node', subItemsHeading: {key: 'failureReason', itemType: 'text'}, text: str_(i18n.UIStrings.columnElement)},
      /* eslint-enable max-len */
    ];

    const details = Audit.makeTableDetails(headings, results);

    let displayValue;
    if (results.length > 0) {
      displayValue = str_(UIStrings.displayValue, {itemCount: results.length});
    }

    return {
      score: results.length === 0 ? 1 : 0,
      notApplicable: results.length === 0,
      details,
      displayValue,
    };
  }
}

module.exports = NonCompositedAnimations;
module.exports.UIStrings = UIStrings;