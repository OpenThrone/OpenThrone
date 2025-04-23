import React, { useEffect, useState } from 'react';

import { useUser } from '@/context/users';
import { alertService } from '@/services';
import { UnitProps, UnitType } from '@/types/typings'; // Import UnitType

/**
 * Props for the UnitSection component.
 * @deprecated Consider using NewUnitSection component instead due to direct DOM manipulation and potential outdated logic.
 */
type UnitSectionProps = {
  /** The heading/title for the unit section (e.g., "Offense"). */
  heading: string;
  /** An array of unit data objects to display. */
  units: UnitProps[];
  /** Callback function to update the total cost in the parent component. */
  updateTotalCost: (costChange: number) => void;
  /** Callback function triggered after a train action. */
  onTrain?: (sectionHeading: string) => void; // Optional callback
  /** Callback function triggered after an untrain action. */
  onUntrain?: (sectionHeading: string) => void; // Optional callback
};

/**
 * @deprecated This component uses direct DOM manipulation and may be outdated.
 * Consider using the NewUnitSection component for better state management and UI consistency.
 *
 * Displays a section for training/untraining specific types of units.
 */
const UnitSection: React.FC<UnitSectionProps> = ({
  heading,
  units,
  updateTotalCost,
  onTrain,
  onUntrain,
}) => {
  const { user, forceUpdate } = useUser();
  // Note: getUnits state is set but never updated after initialization.
  const [getUnits, setUnits] = useState<UnitProps[]>(units || []);

  // Effect to attach input listeners for cost calculation (uses DOM manipulation)
  useEffect(() => {
    const computeTotalCostForSection = () => {
      let sectionCost = 0;
      units.forEach((unit) => {
        const inputElement = document.querySelector(`input[name="${unit.id}"]`) as HTMLInputElement;
        // Ensure cost is parsed correctly, handling potential non-numeric values
        const unitCost = parseInt(String(unit.cost).replace(/,/g, ''), 10) || 0;
        const quantity = parseInt(inputElement?.value || '0', 10) || 0;
        sectionCost += quantity * unitCost;
      });
      updateTotalCost(sectionCost); // Send the total cost for this section
    };

    const inputElements: NodeListOf<HTMLInputElement> = document.querySelectorAll(
      units.map(unit => `input[name="${unit.id}"]`).join(',')
    );

    inputElements.forEach(inputElement => {
      inputElement?.addEventListener('input', computeTotalCostForSection);
    });

    // Initial calculation
    computeTotalCostForSection();

    return () => {
      inputElements.forEach(inputElement => {
        inputElement?.removeEventListener('input', computeTotalCostForSection);
      });
    };
  }, [units, updateTotalCost]); // Dependency array includes units and updateTotalCost

  if (!user || !user.id) {
    // Avoid rendering or causing errors if user data isn't ready
    // alertService.error('User information is not available.'); // Alerting here might be too early
    return null; // Render nothing until user is loaded
  }

  const handleTrain = async () => {
    const unitsToTrain = units
      .filter((unit) => unit.enabled)
      .map((unit) => {
        const inputElement = document.querySelector(
          `input[name="${unit.id}"]`
        ) as HTMLInputElement;
        const quantity = parseInt(inputElement?.value || '0', 10);
        if (!inputElement || isNaN(quantity) || quantity <= 0) return null; // Skip if no input or invalid/zero quantity
        return {
          type: unit.type as UnitType, // Use imported UnitType
          quantity: quantity,
          level: unit.level ?? 1, // Default level to 1 if undefined
        };
      })
      .filter((unit): unit is { type: UnitType; quantity: number; level: number } => unit !== null); // Filter out nulls and type guard

    if (unitsToTrain.length === 0) {
        alertService.warn('No units selected to train.');
        return;
    }

    try {
      const response = await fetch('/api/training/train', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          units: unitsToTrain,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alertService.success(data.message || 'Units trained successfully!');
        // Update local state based on the response data structure
        // Assuming data.data contains the updated unit list for the user
        if (data.data && Array.isArray(data.data)) {
            forceUpdate(); // Trigger context update which should refetch user data
            // Reset inputs after successful train
            units.forEach((unit) => {
              if (unit.enabled) {
                const inputElement = document.querySelector(`input[name="${unit.id}"]`) as HTMLInputElement;
                if (inputElement) inputElement.value = "0";
              }
            });
            updateTotalCost(0); // Reset cost for this section
        } else {
             console.warn("Train API response did not contain expected data structure:", data);
             // Still force update, maybe the backend updated correctly
             forceUpdate();
        }
      } else {
        alertService.error(data.error || 'Training failed.');
      }
    } catch (error) {
      console.error("Training error:", error);
      alertService.error('Failed to train units. Please try again.');
    }
  };

  const handleUntrain = async () => {
    const unitsToUntrain = units
      .filter((unit) => unit.enabled)
      .map((unit) => {
        const inputElement = document.querySelector(
          `input[name="${unit.id}"]`
        ) as HTMLInputElement;
        const quantity = parseInt(inputElement?.value || '0', 10);
         if (!inputElement || isNaN(quantity) || quantity <= 0) return null; // Skip if no input or invalid/zero quantity

        // Basic check: Ensure we don't try to untrain more than owned
        if (quantity > (unit.ownedUnits ?? 0)) {
            alertService.error(`Cannot untrain ${quantity} ${unit.name}(s), you only own ${unit.ownedUnits ?? 0}.`);
            return 'INVALID_QUANTITY'; // Special marker to indicate invalid input
        }

        return {
          type: unit.type as UnitType,
          quantity: quantity,
          level: unit.level ?? 1,
        };
      })
      .filter((unit): unit is { type: UnitType; quantity: number; level: number } => unit !== null && unit !== 'INVALID_QUANTITY'); // Filter out nulls and invalid quantities

    // If any quantity was invalid, stop the process
    if (units.some(unit => {
        const inputElement = document.querySelector(`input[name="${unit.id}"]`) as HTMLInputElement;
        const quantity = parseInt(inputElement?.value || '0', 10);
        return quantity > (unit.ownedUnits ?? 0);
    })) {
        return; // Stop if any input quantity exceeds owned units
    }


    if (unitsToUntrain.length === 0) {
        alertService.warn('No units selected to untrain.');
        return;
    }

    try {
      const response = await fetch('/api/training/untrain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          units: unitsToUntrain,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alertService.success(data.message || 'Units untrained successfully!');
         if (data.data && Array.isArray(data.data)) {
            forceUpdate(); // Trigger context update
            // Reset inputs after successful untrain
            units.forEach((unit) => {
              if (unit.enabled) {
                const inputElement = document.querySelector(`input[name="${unit.id}"]`) as HTMLInputElement;
                if (inputElement) inputElement.value = "0";
              }
            });
            updateTotalCost(0); // Reset cost for this section
        } else {
             console.warn("Untrain API response did not contain expected data structure:", data);
             forceUpdate(); // Still force update
        }
      } else {
        alertService.error(data.error || 'Untraining failed.');
      }
    } catch (error) {
      console.error("Untraining error:", error);
      alertService.error('Failed to untrain units. Please try again.');
    }
  };

  const handleTrainClick = () => {
    handleTrain();
    onTrain && onTrain(heading); // Use the passed down handler
    // Reset inputs via DOM manipulation
    units.forEach((unit) => {
      if (unit.enabled) {
        const inputElement = document.querySelector(
          `input[name="${unit.id}"]`
        ) as HTMLInputElement;
        if (inputElement) inputElement.value = "0";
      }
    });
    updateTotalCost(0);
  };

  const handleUntrainClick = () => {
    handleUntrain();
    onUntrain && onUntrain(heading); // Use the passed down handler
    // Reset inputs via DOM manipulation
    units.forEach((unit) => {
      if (unit.enabled) {
        const inputElement = document.querySelector(`input[name="${unit.id}"]`) as HTMLInputElement;
        if (inputElement) inputElement.value = "0";
      }
    });
    updateTotalCost(0);
  };

  return (
    <div className="my-10 rounded-lg bg-gray-800">
      <table className="w-full table-auto">
        <thead>
          <tr>
            <th className="w-60 px-4 py-2">{heading}</th>
            <th className="w-10 px-4 py-2">Bonus</th>
            <th className="w-10 px-4 py-2">You Have</th>
            <th className="w-10 px-4 py-2">Cost</th>
            <th className="w-10 px-4 py-2">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            // Sort units by level primarily, then by name for consistent order
            const sortedUnits = [...units].sort((a, b) => {
                const levelA = a.level ?? 0;
                const levelB = b.level ?? 0;
                if (levelA !== levelB) {
                    return levelA - levelB;
                }
                return a.name.localeCompare(b.name);
            });
            const firstDisabledUnit = sortedUnits.find(u => !u.enabled); // Find the first disabled unit.
            return sortedUnits.map((unit) => {
              if (unit.enabled) {
                return (
                  <tr key={unit.id}>
                    <td className="border px-4 py-2">{unit.name}</td>
                    <td className="border px-4 py-2">+{unit.bonus} {heading}</td>
                    <td className="border px-4 py-2">
                      <span id={`${unit.id}_owned`}>{unit.ownedUnits ?? 0}</span> {/* Default to 0 if undefined */}
                    </td>
                    <td className="border px-4 py-2">{unit.cost}</td>
                    <td className="border px-4 py-2">
                      <input
                        type="number"
                        aria-label={`Quantity for ${unit.name}`} // Improved accessibility
                        name={unit.id}
                        defaultValue="0"
                        min="0"
                        className="w-full rounded-md bg-gray-600 p-2"
                      />
                    </td>
                  </tr>
                );
              } else if (unit.id === firstDisabledUnit?.id) {
                // Rendering for the first disabled unit
                return (
                  <tr key={unit.id}>
                    <td className="border px-4 py-2">{unit.name}</td>
                    <td className="border px-4 py-2">-</td>
                    <td colSpan={3} className="border px-4 py-2 text-center">
                      Unlocked with {unit.requirement}
                    </td>
                  </tr>
                );
              }
              return null; // For all other disabled units, do not render anything.
            });
          })()}
        </tbody>
      </table>
      <div className="mt-2 flex p-2 justify-between">
        <button
          className="rounded bg-blue-500 px-4 py-2 font-bold text-blue-100 hover:bg-blue-700"
          onClick={handleTrainClick}
          type="button"
        >
          Train
        </button>
        <button
          className="rounded bg-red-500 px-4 py-2 font-bold text-red-100 hover:bg-red-700"
          onClick={handleUntrainClick}
          type="button"
        >
          Untrain
        </button>
      </div>
    </div>
  );
};

export default UnitSection;
