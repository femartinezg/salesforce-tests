import * as vscode from 'vscode';
import { contextManager } from '../common';
import { ApexTestClass } from '../classes/Apex';
import { runTestClass } from '../common/sfActions';

export async function runTestClassCommandHandler(runTestInput?: any) {
    const testClasses = contextManager.apexTestsData.testClasses;
    let testClass = undefined;
    let testClassName: string | undefined = undefined;

    if(runTestInput instanceof Object) {
        testClassName = runTestInput.label;
    }

    if(!runTestInput) {
        const options = testClasses?.map((testClass: ApexTestClass) => {return testClass.name}) || [];
        testClassName = await vscode.window.showQuickPick(options, {
            placeHolder: 'Select the Apex test class to run'
        });
    }

    testClass = testClasses?.find((testClass: ApexTestClass) => testClass.name === testClassName);

    if(!testClass || testClass.status === 'Running') {
        return;
    }

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Running ${testClassName}...`,
        cancellable: false
    }, async () => {
        await runTestClass(testClass);
    });
}